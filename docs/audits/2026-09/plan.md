# Module Correctness & Performance Audit (2026-09) — Plan

> **Revision 2026-09-30 — read this first.** Written against `main@6e5a600f` (2026-09-14); none of it had
> started when it was committed here, 437 commits later, against `main@7230135b` (the #245 merge). The
> known-open register (§4) is therefore a list of leads to re-check, not facts. Changes since the original:
>
> - **Where it lives.** This file, the ledger (`ledger.md`) and the performance baseline (`perf-baseline.md`)
>   sit together in `docs/audits/2026-09/`. The map of the codebase this revision rests on (module sizes,
>   growth, hot spots, measured debt) is the doc "Stabileo: mapa del código y plan de auditoría".
> - **K1 is superseded.** Main's CI turned red again from `be38d4b5` (#231): the @slow contrast spec found the
>   quantities hint at 3.62:1. Fixed in Phase 0; the cause — the @slow suite runs on main only, so PRs merge
>   what it would catch — is ledger row W13-01.
> - **Phase 1 gains a second half: the cross-cutting patterns.** The reviews of #226–#245 confirmed about 60
>   findings, nearly all in eight patterns that cut across modules (C for cross-cutting: P1–P9 stay the performance leads of §4.4). Each is fixed once, with a guard test in
>   CI, before the module audits, so it stops resurfacing in each of them: C-1 a refusal turned into a
>   silent success; C-2 one concept with several sources of truth (weld tolerances, the 3D-mode check);
>   C-3 duplicated helpers drifting; C-4 new id-bearing fields that remaps and persistence miss; C-5 store
>   reactivity outside components; C-6 repeated or main-thread work; C-7 numerical thresholds referenced to
>   the wrong quantity; C-8 tests that pin source text. Their tasks are numbered from 1.4 in the
>   order they are taken (1.4 = C-2's 3D-mode check, 1.5 = C-8); the i18n split (en/es/pt, 8.5 k lines, >150 commits a month each) goes with C-3.
> - **Two modules without a task.** `web/src/lib/engine/steps` (explained steps, 8.9 k lines) and
>   `web/src/lib/engine/force-method` (1.8 k) were written after this plan. They become tasks 2.28 (W18) and
>   2.29 (W19), tier 1: both print numbers a student or an engineer reads as the answer.
> - **Size.** The large-file splits (model store, App, the viewports, solver-service, ProAdvancedTab) are a
>   Phase 3 item, done module by module after that module's audit, never before it.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assess every module of Stabileo at `main@6e5a600f` for correctness (the numbers a user sees are right, and failures are loud) and performance (hot paths measured against a recorded baseline). Confirmed defects get fixed with fail-before/pass-after tests; everything else goes into a findings ledger.

**Architecture:** Phase 0 establishes a green, measured baseline. Phase 1 builds three cross-cutting instruments that many modules reuse: a WASM reachability map, a "which implementation actually runs" map, and differential (Rust↔TS, sparse↔dense) tests. Phase 2 audits one module per branch/PR in risk order using the protocol in §1. Phase 3 re-measures and publishes.

**Tech Stack:** Rust nightly engine (`engine/`: wasm-bindgen, criterion, cargo-nextest), Svelte 5 + TypeScript web app (`web/`: vitest, Playwright), Rust backend (`backend/`), one serverless function (`functions/api/feedback.ts`). Profilers available locally: samply, cargo-flamegraph, hyperfine, cargo-criterion, cargo-fuzz. Not installed: cargo-llvm-cov, cargo-mutants.

**Spec:** `docs/AUDIT_PLAN.md` in the primary checkout (August 2026, untracked, never merged). This plan supersedes it. Its protocol and ground rules are carried into §1–§2, so this file stands alone.

## Global Constraints

- Base every branch on `origin/main`. One worktree per module, created from the repo root: `git worktree add -b audit/<id> .audit-<id>-work origin/main`.
- A fresh worktree needs `cd web && npm ci && npm run wasm` before any web test. `web/src/lib/wasm` is gitignored; never copy it from another worktree (`web/vitest.setup.ts` explains the out-of-bounds trap).
- Engine gate: `cargo nextest run -p dedaliano-engine`. Scoped: `cargo test -p dedaliano-engine --test <target> <filter>`.
- Backend gate: `cargo test -p dedaliano-backend` (CI does not run it — register K2).
- Web gate: `cd web && npm test` (unit + build passes), `npm run check:gate`, `npx playwright test --grep @smoke`. After any engine change run `npm run wasm` first.
- Units: `Material.e` is **MPa** on the solver wire. The TS CIRSOC checks use MPa / kN·m / cm²; the Rust design checks use Pa / N·m / m². Check the units of your own test input before logging a numeric finding: an earlier audit reported two false bugs from writing `e: 200e6`.
- CI runs Node 20; this machine has Node 25. Reproduce CI-only web failures under Node 20 before diagnosing them.
- Performance numbers: same machine (Apple M3, 8 cores, 16 GB), no concurrent builds, ≥10 samples, report median and min–max. Every perf PR carries before/after numbers.
- Commit prefixes follow history: `fix(solver):`, `fix(3d):`, `test(engine):`, `perf(<area>):`, `docs:`.
- PRs target `main`. Commit and push only when the human driving the audit asks.

---

## 0. Why a new plan

- Main moved ~1,350 commits since the August plan was written. Engine perf PRs #174–#180 rewrote numerics inside already-audited code: `sparse_chol.rs` (8 commits), AMD quotient graph, sparse constraint transform, sparse time integration and harmonic, and triplet/sparse tangents in every nonlinear solver.
- PRO steel, concrete, detailing, loads and connections added large TS modules that no audit has covered. `web/src/components/pro` alone took 179 commits; `lib/engine/detailing` is now 1.46 MB across 52 files.
- August status carried forward: done E1, E2, E3, E6, W2; partial E4, W10; never audited E5, E7, E8, E9, W1, W3–W9, W11–W13.
- Of the 36 known/deferred items in the August plan, 30 are still open on main (verified 2026-09-15, register §4).

---

## 1. Per-module protocol (every Phase 2 task follows it)

### Step 1 — Set up
Create the worktree, build, and run the module's scoped tests before touching anything. Record pass counts in the task's ledger section. If scoped tests are red on a clean checkout, that is finding #1 for the module.

### Step 2 — Explore (read-only)
Read the module with its focus questions. Verify every claim from the code: how often does this run, who calls it, what does the test actually assert? A slow function that runs once at load is not a finding. A guard that cannot fire is.

Habits that found real bugs in earlier rounds:
- Content-based tests (`readFileSync` + string match) pin text, not behaviour, and have kept dead code alive.
- `?? x` fallbacks that are unreachable, or reachable only with invalid data.
- Units and axis conventions at every boundary: kN/m/kPa/MPa, Z-up vs Y-up, My vs Mz, local vs global.
- Caches: what the key is, what invalidates it, what gets cached on a cold start.
- Swallowed errors: `catch { return null; }`, `.ok()`, `unwrap_or(identity)`. Twelve wrappers in `wasm-solver.ts` alone do this (register K4).

### Step 3 — Decide with an oracle
Every suspected correctness issue gets a deciding test. Choose the strongest oracle available, in this order:
1. Closed form or textbook solution.
2. A published code table or worked example (`docs/codes/CIRSOC/markdown/` is tracked; `docs/codes/CIRSOC/SOURCES.md` pins source hashes).
3. An independent implementation: Rust↔TS twin, dense↔sparse, worker↔in-thread, engine↔DSM teaching solver.
4. An invariant: equilibrium, symmetry, orthogonality, energy, monotonicity, schema conformance.
5. A regression snapshot. Last resort, never on its own.

If you cannot construct the failing case, it is a *question* in the ledger, not a finding.

### Step 4 — Measure
Run the module's perf workloads (listed per task) and compare against `docs/audits/2026-09/perf-baseline.md` from Phase 0. Profile only the top items:
- Rust: `samply record cargo bench -p dedaliano-engine --bench <bench> -- --profile-time 10 <bench_fn>`
- Web: a Playwright spec wrapping the interaction in `performance.mark`/`performance.measure` and reading `performance.getEntriesByType('measure')` back with `page.evaluate`.

A performance finding needs three things: a hot path (per frame, keystroke, edit, solve, member, or combination), a measured number, and a scaling or percentage claim backed by at least two input sizes.

### Step 5 — Triage
- **Correctness** — wrong numbers, crashes, silent failures, dead features that look alive. Fix in this pass.
- **Performance** — measurable waste on a hot path. Fix in this pass.
- **Hygiene** — dead code, drift, misleading comments. Fix only when cheap and clearly safe.
- **Deferred** — real but risky, needs an owner decision, or changes user-visible numbers by convention. Ledger entry with the reason; do not fix.

### Step 6 — Fix
- Minimal diffs; no opportunistic refactors or reformatting.
- Write the failing test first, run it, watch it fail for the stated reason, then fix.
- Never weaken, delete, skip or widen a test to make it pass. A test that a dead guard made vacuously true is a finding.
- Perf fixes must prove outputs unchanged: bit-identical, or a justified floating-point tolerance pinned by a test.

### Step 7 — Verify and ship
- Scoped tests, then the full gate for every touched side (engine / web / backend).
- Re-read your complete diff adversarially before opening the PR. This caught a regression in every round of the PR124 cycle.
- PR body: findings with severities, what was fixed, what was deferred and why, verification output, perf before/after.
- Update the module's ledger rows and the status table (end of this file).

---

## 2. Ground rules

- **One module per tree area at a time.** One engine module and one web module may run concurrently in separate worktrees because their paths are disjoint. Never two in the same area.
- **Stay in scope.** Record out-of-module problems in the ledger under the owning module and move on.
- **Solver numbers are sacred.** Refactors must be provably behaviour-preserving. Changing a formula is a correctness change and needs reference evidence (textbook, published table, or another solver).
- **Never silence a signal.** No raised tolerances, deleted assertions, `#[ignore]`, skipped tests, or swallowed errors unless the error path genuinely is an answer and a comment says why.
- **Comments age.** When a change invalidates a nearby comment, fix it in the same commit.

---

## 3. Ledger and baseline formats

Create `docs/audits/2026-09/` in Task 0.1. Two files are the audit's source of truth.

`docs/audits/2026-09/ledger.md` — one row per finding or question:

```markdown
| ID | Module | Sev | Kind | Location (path:line @sha) | What breaks, and the evidence (test name or measurement) | Status | PR |
|----|--------|-----|------|---------------------------|-----------------------------------------------------------|--------|----|
| W7a-03 | W7a | HIGH | correctness | web/src/lib/engine/codes/argentina/cirsoc201.ts:292 @6e5a600f | φMn differs from Rust twin by 4 % at fy=500 — `cirsoc201-flexure.parity.test.ts` | fixed | #2xx |
```

- **Sev HIGH:** a wrong number an engineer could design with, a silent failure, data loss or corruption.
- **Sev MEDIUM:** a wrong number only on rare inputs or behind a visible warning; a >2× regression or O(n²) behaviour on a hot path.
- **Sev LOW:** hygiene, misleading text, cold-path waste.
- **Kind:** `correctness` · `performance` · `hygiene` · `question` · `deferred`.
- **Status:** `open` · `fixed` · `deferred` · `not-a-bug` (keep the row and the deciding test).

`docs/audits/2026-09/perf-baseline.md` — one row per measured workload:

```markdown
| Workload | Command | Metric | Median | Min–Max | Gate threshold (if any) | Headroom | Measured @sha, date |
|----------|---------|--------|--------|---------|-------------------------|----------|---------------------|
```

---

## 4. Known-open register (starting point, not a to-do list)

Each module task begins by re-checking its rows here. How much each row can be trusted depends on its source:
- **code** — verified in code at `6e5a600f` on 2026-09-15, with the path:line quoted.
- **doc** — stated in `docs/` or `docs/handoffs/`, not re-verified. Several handoff items described as open turned out to be fixed on main, so treat doc rows as leads.
- **suspicion** — noticed while verifying, no deciding test yet.

Row IDs are what the ledger cites. The owner is the Phase 2 module that must decide the row.

### 4.1 Cross-cutting (verified)

| ID | Owner | Item | Evidence |
|----|-------|------|----------|
| K1 | W13 | Main CI is red on #197. The e2e job's "E2E slow suite" step fails: `e2e/prerender.spec.ts:242` hits its 60 s timeout, plus "End of central directory record signature not found". The same job was also red on #180. | code: `gh run view 34904881669` |
| K2 | W13, W12 | Backend tests never run in CI. `backend` is a workspace member, but no `ci.yml` step builds or tests it. | code: `.github/workflows/ci.yml`, `Cargo.toml` |
| K3 | E9, W7, W1 | Of the 36 exports wired through the `wasmX = wasm.<export>` pattern, 18 wrappers have **no production caller**: `checkCirsoc201Members`, `checkServiceability`, `extractBeamStations`, `extractBeamStations3D`, `extractBeamStationsGrouped`, `computeDiagramValueAtWasm`, `computeDiagramValueAt3DWasm`, `solveMovingLoads3D`, `solveNonlinearMaterial3D`, `solveStaged2D`, `solveHarmonic2D`, `solveWinkler2D`, `solveConstrained2D`, `solveContact2D`, `solveSSI2D`, `solveFiberNonlinear2D`, `solveCreepShrinkage2D`, `solveWithImperfections2D`. Six are **test-only**: `solveCable2D`, `solveArcLength`, `solveDisplacementControl`, `guyanReduce2D`, `craigBampton2D`, `analyzeSectionPlastic`. The Rust steel, RC, EC2/EC3, timber, CFS, masonry, bolt, weld and footing checks **are** reachable, through the `ProVerificationTab.svelte` dropdown (`isDesignCheckAvailable`) and `codes/{cfs,eu,masonry}/index.ts`. The remaining 51 exports use another wiring pattern and are unclassified until Task 1.1. The static analysis cannot see callers that bypass the wrapper. | code (bash grep): `wasm-solver.ts`, `ProVerificationTab.svelte:38, 113` |
| K4 | W1 | Twelve wrappers in `wasm-solver.ts` swallow engine errors with `catch { return null; }` (14 catch blocks across 98 exported functions). Examples: `:943-947` `checkCirsoc201Members`; `:971-993` `checkBolt/Weld/SpreadFooting`, so a failed check in ProVerificationTab shows nothing. | code |
| K5 | E8 | Wire input types carry 120 `Deserialize` derives but only 2 `deny_unknown_fields`, and there are 219 `serde(default)` fields, so a renamed field silently takes its default. `lib.rs` has 0 production `unwrap()`: all 31 are in `mod tests` (line 1260 onward). | code |
| K6 | E9, W7a | The Rust `cirsoc201_check.rs` `compute_phi` hardcodes εty = 0.002 ("fy/Es for 420 MPa steel"), while the TS side recently centralised its φ ramp. Task 1.3's parity test decides it at fy = 500. | suspicion |

### 4.2 Engine

| ID | Owner | Item | Evidence |
|----|-------|------|----------|
| K7 | E4r | `fiber_nonlinear.rs` constitutive details were never deeply audited; two perf commits (triplet/sparse tangents) have landed since. | code |
| K8 | E4r | P-Δ reactions omit K_G·u: reactions use `asm.k`, and K_G goes only into a clone. | code: `pdelta.rs:76-77, 178, 209-240, 435-462` |
| K9 | E4r | `solve_pdelta_3d` never adds shell K_G. The shell K_G adders are called only from `buckling.rs:269-291`. | code: `geometric_stiffness.rs:632+` |
| K10 | E4r | 3D corotational rigid-rotation extraction is the small-angle skew part (≈36 % error at 90°). | code: `corotational.rs:1576-1579` |
| K11 | E4r | 2D plastic event-to-event uses `abs(M)` regardless of sign. | code: `solver/plastic.rs:124, 140, 170` |
| K12 | E4r | The arc-length convergence floor `max(1e-15)` cannot be met as λ→0 at snap-back. | code: `arc_length.rs:222` |
| K13 | E4r | `adaptive_stepping` and `line_search` are dead in production (keep-or-remove decision). | code: `solver/mod.rs:24-25` |
| K14 | E4r | Material-nonlinear reactions are computed as `K·u − F_full` even on failed runs, and `load_displacement` records non-converged increments. | code: `material_nonlinear.rs:274, 287, 1107, 1116` |
| K15 | E4r | 3D plate/quad stresses in material-nonlinear runs appear to use the still-rotated `u_full`, whereas the linear path un-rotates first (`linear.rs:1767, 1778-1779`). If so, shell stresses at inclined-support nodes are wrong. | suspicion: `material_nonlinear.rs:1170-1171` |
| K16 | E4r | `pdelta.rs` has zero references to inclined supports; linear and material-nonlinear both reverse `inclined_transforms`. | suspicion |
| K17 | E4r | Constraint-force redistribution is missing in the corotational, cable, arc-length, fiber and material-nonlinear solvers, so a loaded slave tied to a restrained master mis-reports reactions. | doc: `SR` §Step 6 |
| K18 | E5 | Lanczos still restarts by growing m, with no deflation or locking, so multiplicity ≥ 3 can drop a mode. No triple-eigenvalue test exists. | code: `lanczos.rs:470-481` |
| K19 | E5 | `BucklingResult` is `{modes, n_dof, element_data}`, so a dropped buckling mode cannot be detected. | code: `buckling.rs:12-16` |
| K20 | E5 | The drilling rz DOF is massless in quad, quad9 and curved shell (only rx/ry get rotary mass), while `plate.rs` gives `m·t²/12`. | code: `quad.rs:651-653`, `quad9.rs:564-566`, `curved_shell.rs:1048-1053`, `plate.rs:692-703` |
| K21 | E5 | Modal, spectral, harmonic and time-history results report DOFs in the rotated inclined-support frame. | doc: `SR` §Step 3 |
| K22 | E7 | `count_support_restraints_2d` misses `guidedZ` and `rollerZ`, and the rotation-restraint list misses `guidedZ`. | code: `kinematic.rs:40-41, 231` |
| K23 | E7 | For inclined supports, cable Ernst/slack `dk` is added unrotated; staged analysis rejects inclined supports; there are no reference models for contact, fiber 3D, SSI or creep/shrinkage. | doc: `SR` §Step 3, §Step 5 |
| K24 | E9, W9 | Solid-shell nodal von Mises values are emitted in Gauss-point order (corners 1,2,4,3,5,6,8,7), and `ProResultsTab.svelte:919-940` renders 4 fixed columns for 8-value rows. | code: `solid_shell.rs:65-78, 489-535`, `linear.rs:3922` |
| K25 | E9 | Curved-shell stress recovery is membrane-only: `mx/my/mxy = 0`, and von Mises comes from mid-surface strain. | code: `curved_shell.rs:1195-1197, 1232` |
| K26 | E6r | The curved-shell Jacobian inverse falls back to identity (`invert_3x3(..).unwrap_or(identity)`), so a degenerate element yields plausible-looking stresses instead of an error. | suspicion: `curved_shell.rs:1170, 1229` |
| K27 | E2r | In 2D, the support with the highest ID wins; 3D OR-merges support flags. This is a deliberate-decision item. | code: `dof.rs:26-32` vs `101-108` |
| K28 | E2r | An inclined and a regular support on the same node bypass flag merging; spring checks also read only the winning support. | code: `dof.rs:115-117` |
| K29 | E2r | `cw = Some(0.0)` creates a warping DOF with no stiffness: `dof.rs:78` tests `is_some()` while the assemblers test `> 0.0`. | code: `assembly.rs:755`, `sparse_assembly.rs:1081` |
| K30 | E6r | Dead public API remains: DKMT (`plate.rs:1224, 1268`), 11 uncalled `element/cable.rs` functions, and `fef_distributed_torsion_warping` (`fef.rs:375, 458`, where `n1 * 0.0` discards the warping shape). The stale "TS solver opposite sign" comment at `fef.rs:152` can be retired. | code |
| K31 | E1p | Section plastic bisection runs a fixed 80 iterations and `clipped()` allocates twice per triangle per iteration. | code: `section/plastic.rs:57, 98-103, 119` |
| K32 | E1p | `oriented_boundary_edge` does a linear scan per boundary edge (O(B·T)); it is called from the torsion and warping loops. | code: `section/mesh.rs:733-734`, `torsion.rs:195, 217`, `warping.rs:93` |
| K33 | E3r | Reduction internals still densify K_ff; there is no sparse shift-invert and no sparse/dense residual parity on hard shell or mixed models. | doc: `SR` §ASAP #5, Backlog #5-7, #12 |
| K34 | E8 | There is no WASM-vs-native parity suite, no fuzzing of malformed or truncated JSON, and no Firefox/Safari WASM smoke test. | doc: `SR` Backlog #35-36, #41, #43 |
| K35 | E6r, W16 | No Ixy / principal-axis coupling exists anywhere. The 37 catalogue L angles store a weak-axis inertia ≈2.4× their minimum principal inertia, which is unsafe for buckling. There is no Bredt torsion for closed sections (`j: null`). | doc: `HO/m2-ixy-integration-handoff.md` §1-3 |

`SR` = `docs/roadmap/SOLVER_ROADMAP.md`, `HO` = `docs/handoffs/`, `BM` = `docs/BENCHMARKS.md`, `IR` = `docs/roadmap/INFRASTRUCTURE_ROADMAP.md`.

### 4.3 Web, backend, CI

| ID | Owner | Item | Evidence |
|----|-------|------|----------|
| K36 | W1 | `live-calc.ts:86` and `:94` read `err.message ?? …` with no `String(err)` fallback. WASM throws strings, so engine errors show up as the generic message. The `errorText` helper exists but is not used here. | code |
| K37 | W7a | RC beams: torsion is neither verified nor gated (`beamTorsion gate:true` is not enforced). 117 of 119 beams are PROVISIONAL_BIAXIAL, so the secondary axis is unverified. There are no side-face bars and no biaxial shear, and the 10 % ratio gate has no absolute floor. | doc: `docs/audits/biaxial-beam-design.md` §3, §5; `HO/pr19-readiness.md` §3 |
| K38 | W7b | Steel checks: `Lb = L` is hardwired (`verification-service.ts:554`); E.4 and H.3 are not implemented; B.4.1 classification is impossible (its tables are images), so F.2 may run outside its scope; all 15 clause-map entries are unvalidated; `roleUsable('steel')` is always false. | doc: `HO/m2-lb-assumption.md`, `HO/m2-cirsoc301-normative-audit.md` §7-8 |
| K39 | W7b | Material family is guessed from `fy`/`f'c > 80` in four places, and a steel member's context is built with `f'c = fy`, which yields DEMAND_UNAVAILABLE. This may be superseded by the grade-family work. | doc: `HO/pr21-steel-pro-audit.md` §4.2-4.3 |
| K40 | W7b | Cold-formed C/Z: no CIRSOC 303, no verification, an empty tabulated series and sharp corners. `connection-design.ts` has no tests. | doc: `HO/m2-cold-formed-limits.md` |
| K41 | W7c | `CAPABILITY-INDEX.md` still marks CIRSOC 103 unsupported, but main added a static method in `cb826a25`, so the index is stale. CIRSOC 102 gaps: flexible-building gust factor, torsional cases 2/4, parapets, domes, components and cladding. CIRSOC 101 lacks rain and snow. Generated models ship without load cases. | doc: `docs/codes/CIRSOC/CAPABILITY-INDEX.md`, `HO/pr21-lattice-cap-idealisation.md` §8 |
| K42 | W16, E7 | Generated steel sheds with pinned bases or `purlins:false` are mechanisms (no vertical bracing between trusses). | doc: `HO/m1-purlins-false-investigation.md` §6 |
| K43 | W14 | A hogging support with no designed top steel gets no bars, and top assembly bars are never lapped (over 12 m). | doc: `HO/pr19-readiness.md` §3 |
| K44 | W14 | Footing dowels: the realised cover is 36 mm against the intended 50 mm; hooks collide; the cover datum is conflated; the arc cutting length differs from nominal; cover validation only ever reports NOT_EVALUATED. | doc: `HO/deferred-footing-starter-detailing-correction.md` §1-5 |
| K45 | W3 | The share-URL codec drops `composition`, `profileFamily`, `tl` and `built`. Feedback-widget links and edu exercises inherit the loss. | doc, grep-confirmed: `HO/share-codec-fields.md` §1-2 |
| K46 | W3 | Persisted A and I are not re-derived, so older C-custom sections keep their midline values: the same designation has different areas within one project. | doc: `HO/h1-cz-convention-evidence.md` §5 |
| K47 | W4 | Advanced-analysis results are never marked stale after an edit. `verificationStore` is session-only, so a restored project has no demands. No export record exists, so stale exports cannot be detected. | doc: `docs/proposals/pro-advanced-analyses.md`, `HO/f6-viewer-and-f7-performance.md` §4 |
| K48 | W6 | The WebGL renderer crashes in 10–17.5 % of runs (mitigated, not fixed). The non-principal-axes warning in `lib/section/axes.ts` is never shown. | doc: `HO/m1-m2-qa-manual-inventory.md` §J.4, §K.5 |
| K49 | W9 | Coincident nodes are never merged, so pasted floors and stairs can end up silently disconnected. Each plate is one quad, so coarse shell stresses feed RC design. Deleting a footing asks for no confirmation. | doc: `docs/proposals/pro-modelling-tools.md` §3-4 |
| K50 | W15 | XLSX output is never read back, DXF output is never re-parsed (R12 validity unasserted), the report popup and HTML fallback are untested, and IFC Y-up→Z-up is a named regression watch. | doc: `HO/h1-export-coverage-and-contract.md` §2-4 |
| K51 | W11 | `locale-parity` guards only `design.` keys. pt is about 1,172 keys short; 11 unoffered dictionaries are about 2,570 short. The detailing engine has 423 Spanish literals that render in every language. | doc: `HO/i18n-coverage-gap.md` |
| K52 | W12 | The backend has no input or size limits, no rate limiting, no request IDs and no startup config validation. Build-model AI JSON is imported unsanitised, and hosted AI calls have timeouts but no token ceilings. | doc: `IR` items 1-13 |
| K53 | W13 | The @slow e2e suite (408-member model) and the visual baselines run only on main or with the `run-e2e` label (`ci.yml:306, 324`). `@perf` specs never run. `rebar-viewport-cost.spec.ts` and `tab-reactivation.spec.ts` are untagged, so no CI step selects them. | code + doc |
| K54 | W13 | CI has no `concurrency` block and no typecheck/svelte-check job (svelte-check reports 558 errors, 429 of them in `lib/engine`). The org ruleset requires no status checks. | doc: `HO/m1-m2-ci-audit-and-three-decisions.md` §2, §7, §24 |
| K55 | W13 | Wall-clock assertions run under parallel nextest, despite `ci.yml`'s single-thread rationale: `sparse_shell_gates` (<15 s, <2 s) and `integration/postprocess_scaling.rs` (<20 s, in a suite shard). | suspicion |
| K56 | W13, W5 | `basic-selection-permutations` (2D/3D) fails on clean main and has no CI tag; the synthetic clicks at `basic-demos:160/:285` are flaky. | doc: `HO/m1-m2-audit.md` §19 |
| K57 | W2r | Rotated sections make a second digest round trip (`canonical.ts:150-159`). `kappa` is hardcoded to 1.2 in `section-stress-3d.ts:54` although the engine computes it. `analyzeSectionPlastic` is test-only. | code |
| K58 | W5 | Diagram fill and text colours are literals that bypass `canvas/theme.ts` (`draw-diagrams.ts:37-39, 342-351`). | code |

**Closed since August:** material-nonlinear `guidedZ` (`7fa01a7f`), rebar-workspace-open perf bound reworked rather than relaxed (`12c3e2f3`), and the `erasing_op` triage. Handoff leads found already fixed on main: Pratt/Howe topology, REFUSED-vs-FAILED ordering, `retireDocument` ordering, NI/VyI field names, and cirsoc301 having zero tests.

### 4.4 Performance leads

| ID | Owner | Lead | Source |
|----|-------|------|--------|
| P1 | W1 | A 7-storey solve takes 20–40 s normally and over 480 s under accumulated load with the worker pool up; the cause has not been isolated. | `HO/pr19-readiness.md` §9 |
| P2 | W6, W10 | Returning to the tab lags 1–4 s on the 7-storey model with the viewer open; cause unknown. | `HO/pr20-readiness.md` §3 |
| P3 | W14, W6 | The rebar 3D workspace takes about 2.1 s to open; two thirds of that is the first-frame GPU flush of 1.46 M triangles. The scene cache misses on every reopen (412 ms). | `HO/f6-viewer-and-f7-performance.md` §7.1-7.3 |
| P4 | W7b, W6 | The industrial-shed joint viewer takes 1,176–1,411 ms (logged, not gated). `viewport-perf.spec.ts` hangs in its harness on `keyboard.up`, so there is no fps signal at all. | `HO/m2-qa-handoff.md`, `HO/m1-m2-audit.md` §5.4 |
| P5 | E3r, E5 | Guyan (6.4 s, of which 4.3 s is 399 back-substitutions) and Craig–Bampton (17.2 s) on 20×20 MITC4 were not re-measured after factorisation reuse. Harmonic direct takes 561 s vs 2.4 s for modal. | `SR` §Step 4 |
| P6 | E2r, E3r | Parallel assembly gains only 1.02–1.06×, and dense beats sparse on an 8×8 curved-shell mesh. | `SR` §Measured Benchmarks |
| P7 | W13 | E2E takes 25.4 min in CI vs 10.5 min locally. | `HO/m1-m2-ci-audit-and-three-decisions.md` §26 |
| P8 | W1 | The live-calc debounce is documented as 120 ms (2D) / 200 ms (3D). Verify it, then measure keystroke-to-result latency on the 408-member model. | `SR` §Step 4 |
| P9 | all | No doc-level budgets exist; the only enforced budgets live in tests (§5). There are no workflow-level timing or memory baselines, no browser memory ceiling and no worker start-up numbers. | `SR` §Step 4, Backlog #31 |

---

## 5. Existing assets to reuse (do not rebuild what exists)

### 5.1 Correctness

**Engine tests** — counted by `#[test]` at `6e5a600f`:
- `validation/` — 4,750 tests in 590 files: ANSYS VM, NAFEMS, Code_Aster, SAP2000, MASTAN2 and textbook cases (see `BM` ledger).
- `reference/` — 1,192 tests. These recompute formulas and never call the engine, so they are **not** engine verification.
- `integration/` 292, root-level gate files 274, `core/` 174, `property/` 19, plus 359 inline tests in `engine/src`.

**CI correctness gates** (`test` job): shell benchmarks, shell acceptance, constraint benchmarks, `sparse_shell_gates`, `solver_invariants`, `solver_ci_coverage`, `conditioning_adversarial`, `kfull_overbuild_gates`.

**Robustness:** `fuzz_crash_free.rs` (random seeds: 10k 2D, 2k 3D, 1k truss, 1k extreme stiffness), `input_validation_gates.rs`, `nan_output_gates.rs`, `local_axis_adversarial.rs`.

**Path parity:** `core/parity.rs`, `integration/{sparse_2d,multi_case,moving_influence}_parity.rs`, `validation/benchmarks/sparse_3d_parity.rs`, `curved_beam_all_solvers_gate.rs`, `inclined_reporting_gates.rs`, `chained_constraints.rs`.

**Rust↔TS parity:** `engine/tests/fixtures/section-stress-parity.json`, shared with `web/.../section-stress-parity.test.ts`; also `local-axes-parity.test.ts`. This is the pattern to copy.

**Web contracts:** `advanced-wire-contracts`, `assert-finite-wire`, `solver-boundary-robustness`, `solver-worker-roundtrip`, `project-restore-roundtrip`, `convention-regression-gates`, `coordinate-contract-grep`, `rc-cad-handoff(-v2)-golden`, `advanced-analyses-numeric` (closed-form P-Δ, buckling, modal, plastic, spectral, moving loads).

**Design numerics:** `web/src/lib/engine/codes/argentina/__tests__/` (`cirsoc-flex-worked-examples`, `*-vs-workbook`, `cirsoc301-benchmarks`) and detailing `fixture-acceptance.test.ts`.

**E2E:** 121 specs (72 tagged `@smoke`, 44 tagged `@slow`). The smoke run fails if the real WASM solver is not loaded.

**Backend:** 4 test files (~118 tests), not run in CI.

**Code documents:** `docs/codes/CIRSOC/markdown/` covers 101-2025, 102-2025, 201-2025, 301-2018 and INPRES-CIRSOC 103 parts I–V, indexed by `CAPABILITY-INDEX.md` and `CLAUSE-INDEX.md`. There is **no clause→test traceability** document; W7 tasks create one per code.

### 5.2 Performance

| Asset | Measures | Enforced threshold | In CI |
|-------|----------|--------------------|-------|
| `engine/tests/perf_regression_gates.rs` | 2D solve (10/100 elements), 3D 5×5 plate, assembly, scaling | <100/500 ms, <2 s, <200/500 ms; scaling ratios <10/12/15× | yes, single-threaded |
| `engine/tests/perf_regression_advanced.rs` | modal/buckling 5×5 and 10×10, harmonic 5×5, Guyan 8×8, Craig–Bampton 6×6 | <5/10 s, <5/15 s, <15 s, <5 s, <5 s | yes, single-threaded |
| `engine/tests/sparse_shell_gates.rs` | fill, no dense fallback, sparse runtime | <15 s, <2 s (2 timing tests `#[ignore]`) | yes, **parallel** (K55) |
| `engine/tests/integration/postprocess_scaling.rs` | `rc_check` over N members | <20 s | yes, suite shard (K55) |
| `engine/tests/bench_phases.rs` | phase breakdowns: MITC4, Guyan, Craig–Bampton, harmonic, AMD/RCM, modified NR | print only; feature `manual-bench-phases` | no |
| `engine/benches/{solver,assembly,workflow}_bench.rs` | criterion, ~40 bench functions including `bench_dense_vs_sparse`, `bench_modal_3d_sparse_mass`, `bench_full_solve_3d_families` | none | main only, quick, continue-on-error |
| `web/scripts/bench-wasm-boundary.mjs` | JS↔WASM serialisation cost | none; manual, needs `/tmp/wasm-old` | no |
| `web/src/lib/engine/design/__tests__/autodesign-regression.test.ts` | 408-member frame auto-design | <1,500 ms plus work-count bounds | yes |
| `web/src/lib/engine/detailing/__tests__/document-model-scale.test.ts` | document model scaling | 2× bars ⇒ <3× time | yes |
| `web/src/lib/three/__tests__/{render-cost.bench,node-picking-bench,rebar-batching}.test.ts` | draw calls and build time, pick hit rate, batching | counts / report only | yes |
| `web/e2e/rebar-workspace-open.spec.ts` (@slow) | workspace open phases | <1,500 / <3,000 ms; median document phase <500 ms | main or label |
| `web/e2e/tab-return-latency.spec.ts` (@slow) | frame gaps on tab return | printed | main or label |
| `web/e2e/rebar-viewport-cost.spec.ts`, `tab-reactivation.spec.ts` (untagged) | toggle/isolate latency, reactivation, WebGL context count | per-model budgets (e.g. 2,500 ms; 600/9,000 ms) | **never** |
| `web/e2e/viewport-perf.spec.ts` (@perf) | orbit/zoom on 3d-building, industrial shed, la-bombonera | draw calls ≤ max; fps printed | **never**; hangs (P4) |
| In-product | `Viewport3D.svelte` perf HUD (`?perf`); `SolveTimings` (`engine/src/types/output.rs:441`) surfaced via `live-calc.ts` and `solver-service.ts` | — | — |

**Canonical workloads**, used by every perf step so numbers are comparable:
- **S:** a 2-node cantilever (the `vitest.setup.ts` smoke model).
- **M:** the 408-member frame (`autodesign-regression`, @slow e2e).
- **L:** the 7-storey `.ded` (48 MB, `ded-roundtrip`), the industrial shed, and la-bombonera (1,005 nodes).
- **Engine:** the criterion shell meshes, up to 50×50.

---

## Phase 0 — Baseline

### Task 0.1: Worktree, builds, ledger skeleton

**Files:**
- Create: `docs/audits/2026-09/ledger.md`
- Create: `docs/audits/2026-09/perf-baseline.md`

- [ ] **Step 1:** From the repo root, `git fetch origin main`, then reuse `.audit-2026-09-work` if it is still at `origin/main`. Otherwise run `git worktree add -b audit/phase0 .audit-phase0-work origin/main`. Record `git rev-parse --short HEAD` as the audit base SHA.
- [ ] **Step 2:** `cd web && npm ci && npm run wasm`. Expected: wasm-pack succeeds and `src/lib/wasm/dedaliano_engine_bg.wasm` exists.
- [ ] **Step 3:** Create both files with exactly the table headers from §3 plus a one-line intro naming the base SHA. The ledger starts empty: module tasks add rows that cite register IDs (K*, P*).
- [ ] **Step 4:** Commit `docs(audit): ledger and perf baseline skeleton for 2026-09 audit`.

### Task 0.2: Correctness baseline

**Files:** Modify `docs/audits/2026-09/ledger.md` by adding a "Baseline @<sha>" section above the table.

- [ ] **Step 1:** `cargo nextest run -p dedaliano-engine --profile ci`. Record passed/failed/skipped. Expected: 0 failures (the engine jobs were green on `6e5a600f`).
- [ ] **Step 2:** `make test-inventory` (~10 min). Record engine-coupled and reference counts next to BM's stamp (5,655 / 1,192 @ `6c3369d6`).
- [ ] **Step 3:** `cargo test -p dedaliano-backend`. Any failure becomes a W12 ledger row (K2).
- [ ] **Step 4:** In `web/`, run `npm test`, `npm run check:gate`, `npm run typecheck`, `npx playwright test --grep @smoke`. Record the counts; K54 claims 558 svelte-check errors, so record the real number.
- [ ] **Step 5:** Inventory silenced tests, so W13 can apply "never silence a signal":
  ```bash
  git grep -n '#\[ignore' -- engine | tee $TMPDIR/ignored-rust.txt | wc -l
  git grep -n -E '\b(it|test|describe)\.(skip|todo)\(|test\.fixme\(' -- web/src web/e2e | tee $TMPDIR/skipped-web.txt | wc -l
  ```
  Record both counts. Attach the lists to the W13 section of the ledger.
- [ ] **Step 6:** Commit `docs(audit): record correctness baseline`.

### Task 0.3: Reproduce and triage main's red CI (K1)

- [ ] **Step 1:** `gh run view 34904881669 --log-failed > $TMPDIR/ci-34904881669.log`, then `gh run download 34904881669 -n playwright-artifacts -D $TMPDIR/pw-34904881669`. Open the trace for `prerender.spec.ts:242`.
- [ ] **Step 2:** Establish why a test titled `@smoke prerender` ran in the `--grep "@slow"` step (tag overlap in the describe title, or a different match). Write the answer in the ledger.
- [ ] **Step 3:** Reproduce locally: `cd web && npm run build && npx playwright test e2e/prerender.spec.ts:242 --repeat-each 5 --workers 1`. Then run the CI step as-is: `npx playwright test --grep "@slow" --grep-invert "visual baselines"`.
- [ ] **Step 4:** Look at the other red main run:
  ```bash
  gh run list --workflow CI --branch main --limit 30 --json databaseId,displayTitle,conclusion \
    --jq '.[] | select(.conclusion=="failure") | "\(.databaseId) \(.displayTitle)"'
  ```
  Then `gh run view <id> --log-failed | grep -E "✘|Error:|timed out" | head -40` for PR #180's run.
- [ ] **Step 5:** Classify each failure as one of: product regression (failing test + fix, owner W17 or W13), harness defect (root cause in the ledger, fix under W13), or infrastructure (evidence in the ledger). No retries and no raised timeouts (§2).

### Task 0.4: Performance baseline

**Files:** Modify `docs/audits/2026-09/perf-baseline.md`.

- [ ] **Step 1:** Engine criterion, full sample sizes, on a quiet machine:
  ```bash
  cd engine && cargo bench --bench solver_bench --bench assembly_bench --bench workflow_bench -- --save-baseline audit-2026-09
  find .. -path '*criterion*/audit-2026-09/estimates.json' | while read f; do
    python3 -c 'import json,sys; e=json.load(open(sys.argv[1])); print(f"{e[\"median\"][\"point_estimate\"]/1e6:10.3f} ms  {sys.argv[1]}")' "$f"
  done | sort -k3 > $TMPDIR/criterion-baseline.txt
  ```
  Copy each median into the table. Later tasks compare against it with `-- --baseline audit-2026-09`.
- [ ] **Step 2:** Engine gate headroom: `cargo nextest run -p dedaliano-engine --test perf_regression_gates --test perf_regression_advanced --test-threads 1`. nextest prints each test's duration; record it against the thresholds in §5.2 as headroom %.
- [ ] **Step 3:** Web perf tests, 10 runs each, per-test durations:
  ```bash
  cd web
  FILES="src/lib/engine/design/__tests__/autodesign-regression.test.ts src/lib/engine/detailing/__tests__/document-model-scale.test.ts src/lib/three/__tests__/render-cost.bench.test.ts src/lib/three/__tests__/node-picking-bench.test.ts src/lib/three/__tests__/rebar-batching.test.ts"
  for i in $(seq 10); do npx vitest run --project unit $FILES --reporter=json --outputFile=$TMPDIR/vt-$i.json >/dev/null; done
  python3 - "$TMPDIR" <<'EOF'
  import json, glob, statistics, sys, collections
  d = collections.defaultdict(list)
  for f in glob.glob(f"{sys.argv[1]}/vt-*.json"):
      for tf in json.load(open(f))["testResults"]:
          for t in tf["assertionResults"]:
              d[t["fullName"]].append(t["duration"])
  for name, v in sorted(d.items()):
      print(f"{statistics.median(v):9.1f} ms  [{min(v):.0f}-{max(v):.0f}]  {name}")
  EOF
  ```
- [ ] **Step 4:** Run the E2E perf specs, including the ones CI never runs: `npx playwright test e2e/rebar-workspace-open.spec.ts e2e/tab-return-latency.spec.ts e2e/rebar-viewport-cost.spec.ts e2e/tab-reactivation.spec.ts --repeat-each 5 --workers 1`. Record the printed phase timings. Run `e2e/viewport-perf.spec.ts --timeout 120000` once; if it hangs as P4 says, record that as a W6 row.
- [ ] **Step 5:** Commit `docs(audit): record performance baseline`.

---

## Phase 1 — Cross-cutting instruments

These are built once and consumed by E8, E9, W1, W7*, W8 and W14.

### Task 1.1: WASM export reachability map (decides K3)

**Files:** Create `docs/audits/2026-09/wasm-reachability.md`

**Produces:** a table, one row per `#[wasm_bindgen]` export: export → `wasm-solver.ts` wrapper variable → exported TS function(s) → production call sites → test call sites → verdict (`app-path` / `test-only` / `unreachable`).

- [ ] **Step 1:** Generate the static map from the worktree root. Run it under **bash**. zsh does not word-split an unquoted `$fns`, so the inner loop sees one word and every lookup silently returns zero; that exact bug produced a false version of K3 while this plan was being written.
  ```bash
  bash <<'EOF' > $TMPDIR/wasm-reachability.txt
  WS=web/src/lib/engine/wasm-solver.ts
  for e in $(grep -A1 '#\[wasm_bindgen' engine/src/lib.rs | grep -oE 'pub fn [a-z0-9_]+' | sed 's/pub fn //'); do
    v=$(grep -oE "[A-Za-z0-9_]+ = wasm\.${e} " "$WS" | head -1 | cut -d' ' -f1)
    if [ -z "$v" ]; then echo "| $e | not wired as \`wasmX = wasm.$e\` — trace by hand |"; continue; fi
    fns=$(awk -v v="$v" '/^export (async )?function [A-Za-z0-9_]+/ {match($0,/function [A-Za-z0-9_]+/); cur=substr($0,RSTART+9,RLENGTH-9)}
         (index($0, v"(") || index($0, v"!(")) && cur!="" {print cur}' "$WS" | sort -u)
    row="| $e | $v |"
    for f in $fns; do
      p=$(git grep -l -w "$f" -- web/src | grep -vE '(__tests__|\.test\.|wasm-solver\.ts)' | tr '\n' ' ')
      t=$(git grep -l -w "$f" -- web/src web/e2e | grep -E '(__tests__|\.test\.|e2e/)' | wc -l | tr -d ' ')
      row="$row $f → prod: ${p:-none}; tests: $t |"
    done
    echo "$row"
  done
  EOF
  grep -c 'prod: none' $TMPDIR/wasm-reachability.txt   # 2026-09-15: 24 (18 unreachable + 6 test-only)
  grep -c 'trace by hand' $TMPDIR/wasm-reachability.txt # 2026-09-15: 51
  ```
- [ ] **Step 2:** Rows with `prod: none` must be checked by hand for **dynamic dispatch** before being marked unreachable. Grep `isDesignCheckAvailable(` callers and any string-keyed lookup in `ProVerificationTab.svelte` and `verification-service.ts`. A doc (`HO/pr21-steel-pro-audit.md` §8.2) says some Rust checks are reachable through a dropdown. Record the exact call chain or "unreachable".
- [ ] **Step 3:** For every `app-path` row, note whether the wrapper swallows errors (`catch { return null; }`, K4) and whether its output is validated for finiteness.
- [ ] **Step 4:** Commit `docs(audit): WASM export reachability map`. Keep/wire/remove decisions for unreachable exports belong to the owner (E9 and W7 record them); this task only records.

### Task 1.2: "Which implementation runs" map

**Files:** Create `docs/audits/2026-09/implementation-map.md`

**Produces:** for each computation that exists in both Rust and TS, which one the app uses, and the differential test that pins them together (or the reason there isn't one).

- [ ] **Step 1:** Fill in this table by reading imports (`git grep -l "from '.*<module>'" -- web/src`) and the Task 1.1 map:

  | Computation | Rust | TS | App uses | Differential test |
  |---|---|---|---|---|
  | CIRSOC 201 flexure/shear | `engine/src/postprocess/cirsoc201_check.rs`, `rc_check.rs` | `web/src/lib/engine/codes/argentina/cirsoc201*.ts`, `web/src/lib/codes/cirsoc201/*` | TS (K3) | Task 1.3 |
  | Steel members | `steel_check.rs`, `ec3_check.rs`, `cfs_check.rs` | `codes/argentina/cirsoc301.ts`, `lib/engine/steel/*` | decide | W7b |
  | Bolts / welds | `connection_check.rs` (`check_bolt_groups`, `check_weld_groups`) | `web/src/lib/connection/*` | decide | W7b |
  | Spread footings | `foundation_check.rs` (`check_spread_footings`) | `detailing/foundation-check.ts`, `footing-flexure.ts` | both? | W14 |
  | Beam stations / design forces | `postprocess/beam_stations.rs` (`extract_beam_stations*`) | `lib/engine/station-design-forces.ts` (2,427 lines, no WASM import) | decide | W14 |
  | Linear DSM | `solver/linear.rs` | `solver-detailed.ts`, `solver-detailed-3d.ts` (DSM teaching; used by `components/dsm`, `ToolbarAdvanced.svelte`) | both | W8 |
  | Kinematic analysis | `solver/kinematic.rs` | `kinematic-report.ts` (1,406 lines) | decide | W8 / E7 |
  | Section torsion / warping | `section/torsion.rs`, `warping.rs` | `torsion-flow.ts`, `warping.ts`, `section-teaching.ts` | decide | W2r |
  | Section stress | `postprocess/section_stress*.rs` | `section-stress.ts`, `section-stress-3d.ts` | both | existing `section-stress-parity.json` |
  | Combinations / envelopes | `postprocess/combinations.rs` | `combinations-service.ts`, `shell-combos.ts` | decide | W1 / E9 |
  | Serviceability | `postprocess/serviceability.rs` | `codes/argentina/serviceability.ts` | TS (K3) | W7a |

- [ ] **Step 2:** Fill in every "decide" cell with the file:line of the call that proves it.
- [ ] **Step 3:** Commit `docs(audit): implementation map for duplicated computations`.

### Task 1.3: Differential tests — patterns every module copies

**Files:**
- Create: `engine/tests/property/sparse_dense_parity.rs`
- Modify: `engine/tests/property/main.rs` (add `mod sparse_dense_parity;`)
- Create: `web/src/lib/engine/__tests__/parity/cirsoc201-flexure.parity.test.ts`

**Consumes:** `dedaliano_engine::linalg::{CscMatrix, sparse_cholesky_solve_full, lu_solve}`, where `CscMatrix::from_triplets(n, rows, cols, vals)` takes the lower triangle and sums duplicates, `to_dense_symmetric()` is row-major, and `sym_mat_vec(&x)` exists. On the TS side: `checkFlexure(params, Mu)` from `codes/argentina/cirsoc201.ts` (MPa, m, kN·m, cm²) and `checkCirsoc201Members(input)` from `wasm-solver.ts` (Pa, m, N·m, m²; returns `null` on any error).

- [ ] **Step 1: Write the engine sparse↔dense property test**

```rust
// engine/tests/property/sparse_dense_parity.rs
//! Sparse Cholesky against dense LU on random FE-like SPD matrices.
//! Guards the numerics rewritten by the sparse perf PRs (#176-#179).

use dedaliano_engine::linalg::{lu_solve, sparse_cholesky_solve_full, CscMatrix};
use rand::{rngs::StdRng, Rng, SeedableRng};

/// Banded couplings plus occasional long-range ones; strict diagonal
/// dominance with a positive diagonal makes the matrix SPD.
fn random_spd(n: usize, rng: &mut StdRng) -> (CscMatrix, Vec<f64>) {
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    let mut diag = vec![0.0_f64; n];
    for j in 0..n {
        for _ in 0..3 {
            let span = if rng.gen_bool(0.1) { n } else { 8.min(n) };
            let i = j + rng.gen_range(0..span);
            if i <= j || i >= n {
                continue;
            }
            let v = rng.gen_range(-1.0..1.0) * 10f64.powi(rng.gen_range(-2..3));
            rows.push(i);
            cols.push(j);
            vals.push(v);
            diag[i] += v.abs();
            diag[j] += v.abs();
        }
    }
    for (k, d) in diag.iter().enumerate() {
        rows.push(k);
        cols.push(k);
        vals.push(d * 1.01 + 1e-3);
    }
    (CscMatrix::from_triplets(n, &rows, &cols, &vals), diag)
}

fn rhs(n: usize) -> Vec<f64> {
    (0..n).map(|i| ((i * 7919) % 13) as f64 - 6.0).collect()
}

#[test]
fn sparse_cholesky_matches_dense_lu_on_random_spd() {
    let mut rng = StdRng::seed_from_u64(0x5eed_2026_09);
    for case in 0..200 {
        let n = 5 + rng.gen_range(0..120);
        let (a, _) = random_spd(n, &mut rng);
        let b = rhs(n);

        let x = sparse_cholesky_solve_full(&a, &b)
            .unwrap_or_else(|| panic!("case {case} n {n}: SPD matrix rejected"));

        // Backward error: ordering-independent, and small for any stable factorisation.
        let r = a.sym_mat_vec(&x);
        let res = r.iter().zip(&b).map(|(ri, bi)| (ri - bi).abs()).fold(0.0, f64::max);
        let bnorm = b.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
        assert!(res <= 1e-10 * bnorm.max(1.0), "case {case} n {n}: residual {res:e}");

        // Forward agreement with an independent dense solve.
        let mut dense = a.to_dense_symmetric();
        let mut b2 = b.clone();
        let xd = lu_solve(&mut dense, &mut b2, n).expect("dense LU rejected an SPD matrix");
        let scale = xd.iter().fold(1.0_f64, |m, v| m.max(v.abs()));
        for i in 0..n {
            assert!(
                (x[i] - xd[i]).abs() <= 1e-7 * scale,
                "case {case} n {n} i {i}: sparse {} vs dense {}", x[i], xd[i]
            );
        }
    }
}

#[test]
fn sparse_cholesky_rejects_indefinite_instead_of_returning_garbage() {
    let mut rng = StdRng::seed_from_u64(0xbad_5eed);
    for case in 0..50 {
        let n = 6 + rng.gen_range(0..60);
        let (a, diag) = random_spd(n, &mut rng);
        let k = rng.gen_range(0..n);
        // a[k][k] + (-3·a[k][k]) = -2·a[k][k]: a strongly negative pivot.
        let a_kk = diag[k] * 1.01 + 1e-3;
        let flip = CscMatrix::from_triplets(n, &[k], &[k], &[-3.0 * a_kk]);
        // linear_combination merges sparsity patterns; add_values_inplace would
        // assert on the mismatched pattern.
        let bad = CscMatrix::linear_combination(1.0, &a, 1.0, &flip);
        assert!(
            sparse_cholesky_solve_full(&bad, &rhs(n)).is_none(),
            "case {case} n {n} k {k}: indefinite matrix was factorised"
        );
    }
}
```

- [ ] **Step 2: Register and run**

Add `mod sparse_dense_parity;` below `mod differential_fuzz;` in `engine/tests/property/main.rs`, then run `cargo test -p dedaliano-engine --test property sparse_`.
Expected: both tests PASS. A failure in either test is an E3r finding: record the case number, `n`, and the assertion message in the ledger. Do not adjust tolerances or seeds to make it pass.

- [ ] **Step 3: Write the TS↔Rust CIRSOC 201 flexure parity test**

```ts
// web/src/lib/engine/__tests__/parity/cirsoc201-flexure.parity.test.ts
/**
 * Same section, same provided steel, two implementations:
 *   TS   checkFlexure             — MPa, m, kN·m, cm²   (what the app runs)
 *   Rust check_cirsoc201_members  — Pa, m, N·m, m²      (wrapped, no app caller: register K3)
 * fy = 500 exercises the φ ramp, whose Rust εty is hardcoded to 0.002 (register K6).
 */
import { describe, expect, it } from 'vitest';
import { checkFlexure } from '../../codes/argentina/cirsoc201';
import { checkCirsoc201Members } from '../../wasm-solver';

const SECTIONS = [
  { fc: 20, fy: 420, b: 0.2, h: 0.4 },
  { fc: 25, fy: 420, b: 0.25, h: 0.6 },
  { fc: 30, fy: 420, b: 0.3, h: 0.7 },
  { fc: 35, fy: 500, b: 0.3, h: 0.5 },
];
// Fractions of a rough capacity scale, chosen to stay singly reinforced.
const MOMENT_FRACTIONS = [0.1, 0.3, 0.6];

describe('CIRSOC 201 flexure — TS checkFlexure vs Rust check_cirsoc201_members', () => {
  for (const s of SECTIONS) {
    for (const f of MOMENT_FRACTIONS) {
      const Mu = f * 0.2 * s.fc * 1e3 * s.b * s.h * s.h; // kN·m
      it(`fc=${s.fc} fy=${s.fy} b=${s.b} h=${s.h} Mu=${Mu.toFixed(1)} kN·m`, () => {
        const ts = checkFlexure({ ...s, cover: 0.03, stirrupDia: 8 }, Mu);
        expect(ts.isDoublyReinforced, 'grid must stay singly reinforced').toBe(false);

        const rust = checkCirsoc201Members({
          members: [{
            elementId: 1, fc: s.fc * 1e6, fy: s.fy * 1e6,
            b: s.b, h: s.h, d: ts.d, asTension: ts.AsProv * 1e-4,
          }],
          forces: [{ elementId: 1, mu: Mu * 1e3 }],
        });
        expect(rust, 'Rust check returned null — error swallowed in wasm-solver.ts').not.toBeNull();

        const phiMnRust = rust[0].phiMn / 1e3; // N·m → kN·m
        const relDiff = Math.abs(phiMnRust - ts.phiMn) / ts.phiMn;
        expect(relDiff, `φMn TS ${ts.phiMn.toFixed(2)} vs Rust ${phiMnRust.toFixed(2)}`).toBeLessThan(0.005);
      });
    }
  }
});
```

- [ ] **Step 4: Run it**

`cd web && npx vitest run --project unit src/lib/engine/__tests__/parity`
Expected: the tests execute against the real WASM (`vitest.setup.ts` calls `initSolver()`). Each divergence is **data**, not a test to be loosened. Record every failing case in the ledger (owner W7a, cites K6), deciding which side matches CIRSOC 201-05 §9.3.2 using `docs/codes/CIRSOC/markdown/`. If the test passes everywhere, K6 is closed as `not-a-bug` and the test stays as the pin.

- [ ] **Step 5: Commit**

```bash
git add engine/tests/property/sparse_dense_parity.rs engine/tests/property/main.rs \
        web/src/lib/engine/__tests__/parity/cirsoc201-flexure.parity.test.ts
git commit -m "test(audit): sparse/dense and CIRSOC 201 TS/Rust differential tests"
```
If a test fails and the fix belongs to a later module, commit the test marked with the ledger ID in its failure message and open the module task. Do not merge a red suite to main: land the test together with its fix.

---

### Task 1.4: C-2 — one answer to "is this a space workspace?"

A mode compared with `'3d'` alone treats PRO, always a space workspace, as a plane one wherever PRO reaches the code.
- [ ] Add `is3DWorkspace(mode)` to a pure module and a `uiStore` getter. Route every dimension check through it; a comparison that asks which mode it is (the Basic 3D button) keeps its literal.
- [ ] Add a gate test that fails on any other comparison of a mode with `'3d'`.
- [ ] Add an e2e test for one behaviour PRO gains. It must fail before the change.
- [ ] Record the sites in the ledger (C-2).

### Task 1.5: C-8 — tests of behaviour, not of source text

- [ ] List the tests that read source files. Class each assertion:
  - (a) a prohibition on a legacy construct, i.e. a lint;
  - (b) an architecture rule ("use the shared helper", "one keyboard layer");
  - (c) a requirement of exact text in one implementation.
- [ ] Replace each (c) with a test that calls the code, or delete it where a behaviour test already covers it. Keep (a) and (b), each with a note on why.
- [ ] Wiring with no unit entry point yet stays, marked as such, until an e2e covers it.

### Tasks 1.6 onward: C-1, C-3…C-7 and the rest of C-2

Each follows 1.4's shape: a single source for the concept, a guard test in CI, and one behaviour test that fails before the change.
- C-1: a refusal reaches the UI as a typed error, never as a silent success. K4's swallowed catches are part of it.
- C-2: the rest are the 51 tolerance constants, weld first.
- C-3: shared helpers replace drifting copies, plus the en/es/pt split by area.
- C-4: a registry of id-bearing fields that remaps and persistence read.
- C-5: stores are exercised from plain code.
- C-6: a solve counter per interaction, and performance budgets.
- C-7: thresholds are referenced to their own quantity, with differential tests.

## Phase 2 — Module audits, in risk order

Risk is the product of three factors:
1. Whether the module produces numbers engineers design with.
2. Churn since the last audit.
3. How thin its external validation is.

Engine and web trees are disjoint, so run tasks in pairs across them: 2.1 with 2.6, 2.2 with 2.7, and so on. Never run two tasks in the same tree at once.

| Order | Module | Name | Tier |
|-------|--------|------|------|
| 2.1 | W7a | CIRSOC 201 concrete checks (TS) | 1: design numbers |
| 2.2 | W14 | RC detailing, drawings, documents | 1 |
| 2.3 | W7b | Steel members and connections | 1 |
| 2.4 | W7c | Loads: CIRSOC 101/102/103 and combinations | 1 |
| 2.5 | W1 | Solver bridge and result pipeline | 1 |
| 2.6 | E9 | Postprocess | 1 |
| 2.7 | E5 | Dynamics | 1 |
| 2.8 | E3r | Sparse linear algebra re-audit | 1 |
| 2.9 | E4r | Nonlinear re-audit | 1 |
| 2.10 | E7 | Special models | 1 |
| 2.28 | W18 | Explained steps (`lib/engine/steps`) — written after this plan; run with tier 1 | 1 |
| 2.29 | W19 | Force method (`lib/engine/force-method`) — written after this plan; run with tier 1 | 1 |
| 2.11 | W13 | Test and CI honesty | 2: trust boundaries and gates |
| 2.12 | E8 | WASM boundary | 2 |
| 2.13 | W3 | Model store, persistence, share links | 2 |
| 2.14 | W4 | Results invalidation | 2 |
| 2.15 | W15 | Importers and exporters | 2 |
| 2.16 | W16 | Catalogues, generators, model tools | 2 |
| 2.17 | W7d | Other code families and capability gating | 2 |
| 2.18 | W6 | 3D rendering | 3: UI correctness and interactive performance |
| 2.19 | W9 | PRO UI | 3 |
| 2.20 | W5 | 2D canvas | 3 |
| 2.21 | W2r | Section TS and stress panels | 3 |
| 2.22 | W8 | Education and DSM | 3 |
| 2.23 | E2r, E6r, E1p | Linear core and elements spot re-check; section-engine perf | 3 |
| 2.24 | W12 | Backend, AI, functions | 4: platform |
| 2.25 | W10 | UI shell, mobile, start-up | 4 |
| 2.26 | W17 | Public site: landing, blog, prerender | 4 |
| 2.27 | W11 | i18n | 4 |

Every task below follows §1. Steps list only what is specific to the module.

### Task 2.1: W7a — CIRSOC 201 concrete checks (TS)

**Scope:**
- `web/src/lib/engine/codes/argentina/cirsoc201.ts`: `checkFlexure` :292, `checkShear` :636, `checkColumn` :738, `checkTorsion` :851, `checkBiaxial` :921, `checkSlender` :1137, `verifyElement` :1341.
- `web/src/lib/engine/codes/argentina/`: `cirsoc201-capacity.ts`, `cirsoc201-circular.ts`, `cirsoc201-flanged.ts`, `losas.ts`, `serviceability.ts`.
- `web/src/lib/codes/cirsoc201/*` and the gates in `web/src/lib/codes/{regulation,revisions,maturity,roles}.ts`.
- Rust twins: `engine/src/postprocess/{cirsoc201_check,rc_check,ec2_check}.rs`.

**Register:** K6, K37, K3. **Branch:** `audit/w7a-cirsoc201`

- [ ] **Step 1:** `cd web && npx vitest run --project unit src/lib/engine/codes src/lib/codes` and record the counts.
- [ ] **Step 2 — Traceability.** Create `docs/audits/2026-09/traceability-cirsoc201.md`:
  ```markdown
  | Clause (CIRSOC 201-2025 §) | Formula | Implementation (path:line) | Test (file › name) | Oracle (worked example / table / Rust twin) |
  ```
  One row per implemented formula, sourced from `docs/codes/CIRSOC/markdown/` via `CLAUSE-INDEX.md`. A row with no test becomes a `question` ledger row.
- [ ] **Step 3 — Decide each question with a test:**
  - φ ramp between εty = fy/Es and 0.005, applied exactly once (K6 parity result from Task 1.3).
  - β1 ramp from 0.85 to 0.65 across f'c = 28 to 56 MPa.
  - Minimum steel: beam (§9.6.1.2) vs slab/footing (§7.6.1). List callers of `.AsReq` and check that none needs `AsFlexural` plus a different minimum.
  - Sign of `Nu` in shear: compression must raise Vc and tension lower it. Test Nu = +P and −P.
  - Torsion threshold and combined V+T; where `beamTorsion gate:true` should be enforced (K37).
  - `checkSlender` and `checkBiaxial` against a worked example of the clause cited in the code comment.
  - Status boundaries: what ratio = 1.000 returns; whether bar-selection rounding can yield `AsProv < AsReq`.
- [ ] **Step 4 — Oracles.** For each clause row without a worked example, add one test beside `codes/argentina/__tests__/cirsoc-flex-worked-examples`. Extend Task 1.3's parity file to shear: `checkShear` against Rust `phiVn`, `vc`, `vs`, with Vu kN→N, `sStirrup` in m, and `av` in m² for that spacing.
- [ ] **Step 5 — Performance.** Time `verifyElement` over every member of the M workload: a `performance.now()` loop in a vitest file, 10 runs, median. Look for per-member scans of all members or forces; the Rust twin removed exactly such an O(members × forces) pairing (`index_forces`).
- [ ] **Step 6:** §1 Steps 5–7.

**Exit:** traceability complete; every row has a test or a ledger entry; parity divergences decided by clause; perf row recorded.

### Task 2.2: W14 — RC detailing, drawings, documents

**Scope:**
- `web/src/lib/engine/detailing/`: 52 files, 1.46 MB, 77 test files. Largest: `run-detailing.ts` 121K, `document-render.ts` 94K, `footing-flexure.ts` 79K, `generate-beam.ts` 64K, `run-footing-design.ts` 53K, `scene-model.ts` 48K, `drawings.ts` 46K, `floor-design.ts` 45K, `footing-dowel-cage.ts` 44K, `generate-column.ts` 40K.
- `web/src/lib/flow/rc-*.ts`; `web/src/lib/export/rc-cad-handoff*.ts` and `*.schema.json`.
- `web/src/lib/store/{detailing.svelte.ts,detailing-footing-inputs.ts,design-run.svelte.ts}`.
- `web/src/lib/engine/station-design-forces.ts` (2,427 lines, pure TS); `web/src/components/pro/design/*`.

**Register:** K43, K44, K51, P3; Task 1.2 rows "Spread footings" and "Beam stations". **Branch:** `audit/w14-detailing`

- [ ] **Step 1:** `npx vitest run --project unit src/lib/engine/detailing src/lib/flow src/lib/export`. Then list the entry points with `grep -n '^export function' src/lib/engine/detailing/{generate-beam,generate-column,footing-dowel-cage,run-detailing}.ts`.
- [ ] **Step 2 — Geometric invariants.** Create `src/lib/engine/detailing/__tests__/invariants.property.test.ts`. For seeded random members within the UI's allowed input ranges, assert:
  - (a) Every bar surface keeps at least the specified cover. This decides K44's 36 mm vs 50 mm.
  - (b) Clear spacing between bars meets the CIRSOC 201 §7.6 limits, quoted from the Markdown.
  - (c) Lap and anchorage lengths are at least the §12 development length.
  - (d) Every support region with hogging demand has top steel. This decides K43.
  - (e) Any bar longer than stock length (12 m) is lapped.

  Report the seed in every failure message.
- [ ] **Step 3 — Schema conformance.** Validate every CAD handoff produced by fixture tests against `rc-cad-handoff.schema.json` / `rc-cad-handoff-v2.schema.json`. First run `ls node_modules/ajv`: use it if present; if absent, write a `question` row. Adding a dependency needs owner approval.
- [ ] **Step 4 — Documents quote, never recompute.** On the `fixture-acceptance` models, assert that each number in the document model built by `document-model.ts` / `document-render.ts` (As, φMn, ratios, bar marks) equals the store value it came from. Compare data, not rendered text.
- [ ] **Step 5 — TS vs engine stations.** For three fixture beams, compare station positions and M/V envelopes from `station-design-forces.ts` with `extractBeamStations3D`. That wrapper has no app caller (K3); call it from the test. Use a relative tolerance of 1e-6 and record whether the TS code duplicates engine logic.
- [ ] **Step 6 — Performance (P3).**
  - Record `document-model-scale.test.ts`.
  - Time `run-detailing` end to end on two sizes (a 3-storey and the 7-storey model).
  - Run `e2e/rebar-workspace-open.spec.ts` ×5 for phase timings.
  - In a Chrome trace, attribute the first-frame cost (1.46 M triangles) and confirm the scene-cache miss on reopen.
- [ ] **Step 7:** §1 Steps 5–7.

**Exit:** invariants test in place; schema validation over all fixtures; quote-not-recompute test; K43 and K44 decided.

### Task 2.3: W7b — Steel members and connections

**Scope:**
- `web/src/lib/engine/codes/argentina/cirsoc301.ts`: `checkSteelTension` :201, `checkSteelCompression` :255, `checkSteelFlexure` :331, `checkSteelShear` :575, `checkSteelInteraction` :643, `verifySteelElement` :730.
- `web/src/lib/engine/steel/*` (9 files); `web/src/lib/connection/*`; `verification-service.ts` (`Lb`, K38).
- `components/pro/{ProSteelWorkflowTab,ProConnectionsTab,ProVerificationTab}.svelte`.
- Rust twins reachable through the dropdown: `steel_check.rs`, `ec3_check.rs`, `cfs_check.rs`, `connection_check.rs`.

**Register:** K38, K39, K40, K35, P4; siblings of #193 (steel axis demand mapping). **Branch:** `audit/w7b-steel`

- [ ] **Step 1:** `npx vitest run --project unit src/lib/engine/steel src/lib/connection src/lib/engine/codes/argentina`
- [ ] **Step 2:** Traceability doc for CIRSOC 301-2018 in the W7a format, covering all 15 clause-map entries (K38). Mark E.4, H.3 and B.4.1 as capability gaps, then add a test showing that a section outside F.2's scope is refused, not reported as PASS.
- [ ] **Step 3 — Decide with tests:**
  - Strong/weak axis mapping (My↔Mz, Z-up) at every hop from solver result to check input. Grep `My|Mz|strong|weak` in `steel/` and `verification-service.ts`.
  - Effect of `Lb = L` on members with intermediate bracing.
  - Cb from the moment diagram against the closed-form Cb for uniform, linear and parabolic diagrams.
  - Continuity of the interaction switch at Pr/Pc = 0.2.
  - Material-family guessing (K39).
  - Bolt shear, bearing and tear-out, and weld directional strength, against worked examples.
  - Whether L-angle buckling uses the minimum principal inertia (K35): compute it with `analyze_section` through WASM and compare with the value the check uses.
- [ ] **Step 4 — Differential.** Compare TS `verifySteelElement` with Rust `checkSteelMembers`, and `bolted-joint.ts` with `checkBoltGroups`, using Task 1.3's mapping pattern. Decide each divergence by clause.
- [ ] **Step 5 — Performance (P4).** Run `e2e/m2-3d-joints.spec.ts` and `e2e/m2-joint-3d.spec.ts` ×5 and record joint-viewer load times. Time the steel verification pass on a shed from `generators/shed.ts` at two sizes.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.4: W7c — Loads: CIRSOC 101/102/103 and combinations

**Scope:**
- `web/src/lib/engine/loads/load-plan.ts`, `web/src/lib/engine/wind-*.ts`, and the files of `cb826a25` (CIRSOC 103 static method).
- `web/src/lib/codes/{regulation,revisions,project-code-settings}.ts`.
- `components/pro/{ProLoadsTab,ProAutoLoadsDialog}.svelte`.
- Combination generation: locate with `git grep -n -i combination -- web/src/lib/engine/loads web/src/lib/codes`.

**Register:** K41, K42. **Branch:** `audit/w7c-loads`

- [ ] **Step 1:** `git show --stat cb826a25 ed33e845`, then scoped vitest over the listed test files.
- [ ] **Step 2:** Traceability docs for CIRSOC 102-2025 and the INPRES-CIRSOC 103 static method. Cover every table lookup; Tabla 3.1 is already pinned by `ed33e845`.
- [ ] **Step 3 — Decide with tests:**
  - Lookups and interpolation exactly at and between table rows.
  - Units: kN/m² vs kgf/m².
  - Direction: apply the generated wind and seismic loads to a symmetric box model and assert that Σ base shear equals a hand calculation and acts along the intended global axis (Z-up).
  - Combination completeness per regulation edition: the generated set equals the code's list, with no gaps, no duplicates and exact factors.
  - Fix the stale `CAPABILITY-INDEX.md` (K41) as a docs commit.
- [ ] **Step 4 — Performance.** On the M workload, time the solve with 10 vs 50 combinations and check that factorisation is reused (engine `solve_multi_case_3d`).
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.5: W1 — Solver bridge and result pipeline

**Scope:** `web/src/lib/engine/`:
- `wasm-solver.ts` (98 exports), `solver-service.ts` (2,087 lines), `solver-pool.ts`, `solver-worker.ts`, `live-calc.ts`
- `solve-*.ts`, `result-*.ts`, `model-*.ts`, `types-*.ts`
- `diagrams.ts`, `diagrams-3d.ts`, `combinations-service.ts`, `influence-service.ts`, `moving-loads.ts`, `shell-*.ts`
- `verification-service.ts`, `auto-verify.ts`, `expand-*.ts`, `constraint-*.ts`, `rigid-*.ts`, `sliding-*.ts`

**Register:** K3, K4, K36, P1, P8. **Branch:** `audit/w1-bridge`

- [ ] **Step 1:** `npx vitest run --project unit src/lib/engine/__tests__`
- [ ] **Step 2 — Error honesty (K4, K36).** List every `catch` in `wasm-solver.ts`, `live-calc.ts` and `solver-service.ts`. For each, write a test that feeds malformed input and asserts the caller receives the engine's message (via `errorText`). Fix by propagating the error, not by logging it.
- [ ] **Step 3 — Field mapping.** Diff the wire fields `grep -oE 'pub [a-z_0-9]+:' engine/src/types/input.rs | sort -u` against the camelCase fields written in `types-*.ts` and `model-*.ts`. A field the TS side never writes silently defaults (K5); hand the list to E8.
- [ ] **Step 4 — Path parity.** Send the same model through `solver-pool`/`solver-worker` and through direct `solve`; the results must be JSON-identical (extend `solver-worker-roundtrip`). Compare TS combinations/envelopes against `combine_results_3d` and `compute_envelope_3d`.
- [ ] **Step 5 — Performance (P1, P8).** On M and L, split one solve into: wire build + `JSON.stringify`, WASM time (`SolveTimings`), `JSON.parse` + mapping, and worker spin-up. Measure live-calc keystroke-to-result latency and the real debounce. For P1, solve 20× in one Playwright session while logging worker count and `performance.memory`, to separate a slow solver from pool or heap growth.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.6: E9 — Postprocess

**Scope:** `engine/src/postprocess/` (22 files).
- App path first: `beam_stations.rs`, `combinations.rs`, `diagrams.rs`, `diagrams_3d.rs`, `influence.rs`, `section_stress.rs`, `section_stress_3d.rs`, `design_demands.rs`, `check_ledger.rs`, `result_summary.rs` (the backend consumes `ResultSummary`).
- Rust design checks reachable from the ProVerificationTab dropdown: steel, rc, ec2, ec3, timber, cfs, masonry, connection, foundation.
- Unreachable: `cirsoc201_check.rs`, `serviceability.rs` (K3).

**Register:** K24, K25, K3, K6. Also look for siblings of the recently fixed CHS shear-peak bug (reported at half its true value). **Branch:** `audit/e9-postprocess`

- [ ] **Step 1:** `cargo nextest run -p dedaliano-engine -E 'test(/diagram|envelope|combination|influence|station|section_stress|check/)'` and record the counts.
- [ ] **Step 2 — Invariants property test.** Create `engine/tests/property/postprocess_invariants.rs` and register it in `property/main.rs`. Reuse the random-model generator from `engine/tests/fuzz_crash_free.rs`; if it is private, move it into `tests/common/` in a test-only commit. Assert:
  - (a) Per load case, Σ reactions + Σ applied loads = 0, for forces and moments.
  - (b) The shear jump at a point load equals P, and dM/dx ≈ V between stations (finite difference).
  - (c) The envelope is ≥ every combination pointwise and equals one of them at each station.
  - (d) The influence-line value at x equals a direct solve with a unit load at x, for 10 random x.
- [ ] **Step 3 — Stress recovery against closed form.** Check σ = N/A ± M·y/I and τ = VQ/(I·b) on rectangular, I, CHS and RHS sections, looking for siblings of the CHS shear bug on other shapes.
  - **K24:** impose a linear displacement field on one solid-shell element and assert that the nodal von Mises at node *i* equals the analytical value at node *i*'s coordinates. This decides the ordering; hand the 4-column table defect to W9.
  - **K25:** a curved-shell panel in pure bending must report mx ≠ 0. If the UI shows these stresses, the finding is HIGH. Fix it (top/bottom recovery), or defer with a visible UI disclosure. Silence is not an option.
- [ ] **Step 4 — Reachable Rust checks.** Test each against one worked example. Record keep/remove decisions for the unreachable ones, and attach the K6 result from Task 1.3.
- [ ] **Step 5 — Performance.** Beam stations cost O(members × stations × combinations): time the grouped 3D extraction on M with 10 vs 50 combinations. Record `integration/postprocess_scaling.rs`. Profile `workflow_bench` end-to-end benches with samply and rank postprocess frames.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.7: E5 — Dynamics (never audited)

**Scope:**
- `engine/src/solver/`: `modal.rs`, `spectral.rs`, `harmonic.rs`, `time_integration.rs` (sparse path from #180), `mass_matrix.rs`, `damping.rs`, `dynamic_validation.rs`.
- `engine/src/linalg/`: `lanczos.rs`, `jacobi.rs`.

**Register:** K18, K19, K20, K21, P5. **Branch:** `audit/e5-dynamics`

- [ ] **Step 1:** `cargo nextest run -p dedaliano-engine -E 'test(/modal|spectral|harmonic|time_history|newmark|lanczos|mass|damping/)'`
- [ ] **Step 2 — Closed forms.**
  - Simply supported beam: fₙ = (nπ/L)²·√(EI/m)/(2π). Cantilever: β₁L = 1.8751. Two-storey shear building: analytical eigenpairs.
  - Assert ≤1 % error, and check convergence under mesh refinement.
  - Mass participation must sum to 100 % when all modes are requested (small models).
  - SRSS and CQC against a hand calculation on a 2-DOF system.
- [ ] **Step 3 — Eigen structure.**
  - Orthogonality on random 3D frames and shell meshes, through both the dense and sparse (n > 80) paths: ΦᵀMΦ = I and ΦᵀKΦ = diag(ω²), within 1e-8.
  - Multiplicity (K18, K19): a doubly symmetric tower and a square plate with eigenvalues of multiplicity 2, 3 and 4. Compare the Lanczos sparse path with dense Jacobi on the same model; the first k modes must agree in count and value. Repeat for buckling.
- [ ] **Step 4 — Shells and supports.**
  - Drilling mass (K20): run modal on a quad and quad9 mesh with free in-plane rotation. Assert there are no NaN, infinite or spurious modes, and compare with the plate-element mesh.
  - Inclined supports (K21): the same structure modelled rotated vs unrotated must give identical frequencies and globally equal mode shapes.
- [ ] **Step 5 — Time and frequency domain.**
  - Newmark average acceleration on an undamped SDOF: energy drift < 1e-6 per period, and period elongation matching the textbook formula.
  - Dense vs sparse time integration (#180): identical histories within 1e-9 relative.
  - Rayleigh coefficients from two target frequencies must reproduce the target damping ratio at both.
  - Harmonic SDOF: peak amplitude = static/(2ζ) and 90° phase at ωₙ. Modal vs direct harmonic parity on a 5×5 plate.
- [ ] **Step 6 — Performance (P5).**
  - Compare `bench_modal`, `bench_modal_3d`, `bench_modal_3d_sparse_mass` and `bench_buckling` against the baseline.
  - Time integration per-step cost, dense vs sparse, at two sizes.
  - Re-measure Guyan and Craig–Bampton on 20×20, together with the CI-excluded `harmonic_modal_vs_direct_timing` (it lives in the same feature-gated file): `cargo test -p dedaliano-engine --release --features manual-bench-phases --test bench_phases -- --nocapture`. Release mode is required; debug timings are meaningless here.
- [ ] **Step 7:** §1 Steps 5–7.

### Task 2.8: E3r — Sparse linear algebra re-audit

**Scope:**
- `engine/src/linalg/`: `sparse_chol.rs` (8 commits since PR141), `amd.rs` (#176), `sparse.rs`, `rcm.rs`.
- `engine/src/solver/`: `sparse_assembly.rs`, `sparse_tangent.rs`, `constraints.rs` (#177).
- Perf PRs #174, #176–#179.

**Register:** K33, P5, P6; the Task 1.3 property tests. **Branch:** `audit/e3r-sparse`

- [ ] **Step 1:** `git log --oneline a020e4d3..origin/main -- engine/src/linalg engine/src/solver/sparse_assembly.rs engine/src/solver/sparse_tangent.rs engine/src/solver/constraints.rs` (`a020e4d3` is the PR141 merge). Read every diff with one question: can this change a number?
- [ ] **Step 2 — Extend the Task 1.3 property tests:**
  - (a) Ordering invariance: solve with every `CholOrdering` variant (enum at `sparse_chol.rs:65`) and with `symbolic_cholesky_with_perm` on a random permutation. Backward error ≤ 1e-10 in every case.
  - (b) `amd::amd_order` returns a valid permutation of `0..n` for random patterns, including empty columns and one dense row.
  - (c) Pattern reuse (#178): refactorising new values on a reused symbolic analysis equals a fresh factorisation.
- [ ] **Step 3 — FE matrices (K33).** Sparse vs dense parity on mixed shell+frame and constrained models, beyond `sparse_3d_parity.rs`. Sparse vs dense C'KC (#177) on the `chained_constraints.rs` models must give identical displacements.
- [ ] **Step 4 — Performance (P6).** Re-verify BM's claims on this machine (22–89× factorisation speedup, 2.6–7.0× fill) with `bench_dense_vs_sparse` and `bench_dense_vs_sparse_solve`. Measure AMD time at three mesh sizes. Find the dense-vs-sparse crossover for curved-shell meshes and check the solver takes the faster path there. Measure parallel assembly speedup.
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.9: E4r — Nonlinear re-audit

**Scope:**
- `engine/src/solver/`: `corotational.rs`, `arc_length.rs`, `material_nonlinear.rs`, `fiber_nonlinear.rs`, `geometric_stiffness.rs`, `pdelta.rs`, `plastic.rs`, `sparse_tangent.rs`, `adaptive_stepping.rs`, `line_search.rs`.
- `engine/src/element/fiber_beam.rs`.

**Register:** K7–K17. **Branch:** `audit/e4r-nonlinear`

- [ ] **Step 1:** `cargo nextest run -p dedaliano-engine -E 'test(/corotational|arc_length|displacement_control|material_nonlinear|fiber|pdelta|plastic|geometric/)'`, plus `--test shell_nonlinear_regressions`.
- [ ] **Step 2 — Post-audit diffs.** Run `git log --oneline aefefa49..origin/main` over the scope (`aefefa49` is the PR142 merge). For each solver whose residual/tangent pair is reachable from tests, check the triplet/sparse tangent against a finite difference on random frames: K_t·δu ≈ R(u+δu) − R(u).
- [ ] **Step 3 — Decide each register row with a test:**
  - **K15:** at load factor → 0, material-nonlinear 3D plate stresses at an inclined-support node must match the linear solve within 1e-6.
  - **K16:** P-Δ with an inclined support vs the same model rotated so its supports are global; global displacements must be identical.
  - **K8:** P-Δ equilibrium ΣR + ΣF = 0 including K_G·u. Quantify the error at B2 ≈ 1.04 and near buckling.
  - **K9:** 3D P-Δ amplification on a shell model vs 1/(1 − P/Pcr) from buckling.
  - **K10:** 3D cantilever under an end moment M = 2πEI/L must roll into a full circle. Report the error at 90°.
  - **K11:** portal frame, gravity then sway, with moment reversal. The 2D plastic result must match the 3D solver on the planar model.
  - **K12:** a snap-back reference case (shallow arch) must converge as λ → 0.
  - **K14:** `converged: false` results must carry reactions consistent with the last converged λ, and must not record non-converged increments in the curve.
  - **K17:** a loaded slave tied to a restrained master must report the linear solver's reactions in the linear limit.
  - **K7:** fiber constitutive laws sampled against their formulas, including unloading and reloading; the moment–curvature of an elastic-plastic rectangle reaches Mp = fy·b·h²/4.
  - **K13:** record the keep/remove decision.
- [ ] **Step 4 — Performance.** Compare `bench_corotational`, `bench_corotational_e2e`, `bench_material_nonlinear`, `bench_fiber_nonlinear`, `bench_pdelta`, `bench_pdelta_3d` against the baseline. At two sizes, count iterations and factorisations per load step to test the modified Newton–Raphson claims.
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.10: E7 — Special models (never audited)

**Scope:** `engine/src/solver/`: `staged.rs`, `contact.rs`, `cable.rs`, `ssi.rs`, `winkler.rs`, `soil_curves.rs`, `creep_shrinkage.rs`, `prestress.rs`, `imperfections.rs`, `moving_loads.rs`, `kinematic.rs`, `buckling.rs`, `conditioning.rs`. 13 commits have landed since August. Audit the variants the app actually calls first: several 2D entry points have no app caller (K3). Record keep/remove for those.

**Register:** K22, K23, K42, K19, K3. **Branch:** `audit/e7-special`

- [ ] **Step 1:** `cargo nextest run -p dedaliano-engine -E 'test(/staged|contact|cable|ssi|winkler|soil|creep|shrink|prestress|imperfection|moving|kinematic|buckling|conditioning/)'`
- [ ] **Step 2 — Decide with tests:**
  - **K22:** determinacy count for a simple beam with `guidedZ` and with `rollerZ` supports, vs a hand count.
  - **Soil curves:** p–y, t–z and q–z are monotone (tangent ≥ 0 unless softening is documented) and bounded beyond the table ends.
  - **Creep/shrinkage:** confirm the time units. Compare φ(t, t₀) at t = 10,000 days with a published value for whichever model the code implements.
  - **Prestress:** a parabolic tendon on a simply supported beam gives an equivalent load w = 8Pe/L². The net midspan deflection must match the (q − w) hand calculation.
  - **Moving loads:** influence superposition vs direct solves at 20 truck positions, extended to 3D.
  - **Contact:** penetration at convergence ≤ the stated tolerance; the contact force between two touching cantilevers must match the analytical value.
  - **Staged:** with no time effects and the same final structure, the stage-by-stage sum equals a one-shot solve. The inclined-support rejection (K23) must be an explicit error.
  - **Cable:** single-cable catenary sag and tension against the analytical solution.
  - **Generated sheds (K42):** run `generators/shed.ts` output with pinned bases and with `purlins:false` through `analyze_kinematics_3d`. It must report a mechanism before any solve. The generator fix belongs to W16.
- [ ] **Step 3 — Performance.** Compare `bench_contact`, `bench_contact_e2e`, `bench_cable`, `bench_creep_shrinkage`, `bench_moving_loads`, `bench_moving_influence_reuse`, `bench_buckling` against the baseline. Count factorisations per stage in staged runs to check reuse.
- [ ] **Step 4:** §1 Steps 5–7.

### Task 2.11: W13 — Test and CI honesty

**Scope:**
- `.github/workflows/{ci,deploy-gh-pages}.yml`, `Makefile`, `engine/.config/nextest.toml`.
- `web/scripts/{test-all.mjs,svelte-check-gate.mjs,typecheck.mjs,prerender.ts}`, `web/vitest.setup.ts`, `web/playwright.config.ts`.
- Every test that asserts wall-clock time.

**Register:** K1, K2, K53–K56, P4, P7, plus the Task 0.2 silenced-test inventory. **Branch:** `audit/w13-ci`

- [ ] **Step 1 — Can each gate pass without testing?**
  - For every named nextest gate in `ci.yml`, run `cargo nextest list -p dedaliano-engine --profile ci -E '<filter>' | wc -l`. A filter that matches 0 tests is a finding.
  - For every step with `continue-on-error` or an `if:` condition, write down what it guards and who notices when it is red.
- [ ] **Step 2 — Silenced tests.** Every `#[ignore]`, `.skip`, `.todo` and `.fixme` from Task 0.2 gets a reason and an owner in the ledger, or is re-enabled.
- [ ] **Step 3 — Timing under parallelism (K55).** Run each wall-clock test 20× with `--test-threads 8` and record the flake rate. Then move it to a single-threaded step, or convert it to a work-count bound.
- [ ] **Step 4 — Perf specs that never run (K53, P4).** Find the root cause of the `viewport-perf.spec.ts` hang on `keyboard.up`. Propose tags for `rebar-viewport-cost` and `tab-reactivation`.
- [ ] **Step 5 — Missing jobs (K2, K54).** Draft a `cargo test -p dedaliano-backend` job and a svelte-check job that fails when the error count rises above the baseline; time each locally. Add a `concurrency` block. These are PR proposals: branch protection is the org owner's call.
- [ ] **Step 6 — Content-based tests.** Classify each hit of `git grep -l readFileSync -- web/src | grep -E '(__tests__|\.test\.)'` as pinning behaviour or pinning text. Tests that pin text over dead code are findings.
- [ ] **Step 7 — Performance (P7).** Get per-job and per-step durations from `gh run view <id> --json jobs`. Take the 10 slowest e2e specs from the uploaded Playwright report.
- [ ] **Step 8:** §1 Steps 5–7.

### Task 2.12: E8 — WASM boundary

**Scope:** `engine/src/lib.rs` (1,892 lines, 87 exports, `mod tests` from :1260) and `engine/src/types/{input,output}.rs`. W1 owns TS-side error surfacing; E8 owns the Rust side.

**Register:** K5, K34, K4. **Branch:** `audit/e8-wasm-boundary`

- [ ] **Step 1 — Unknown fields (K5).** In a branch, add `#[serde(deny_unknown_fields)]` to every input type parsed by an app-path export (from the Task 1.1 map). Then run `npm run wasm && npm test`. The list of breakages is the measurement: extra keys the TS side sends. Decide per type; the default goal is that a misspelled field fails loudly.
- [ ] **Step 2 — Physics-changing defaults.** For each of the 219 `serde(default)` fields, ask: would a missing value silently change the physics (stiffness, area, load factor, support flag)? Make each such field required, with a test that omits it.
- [ ] **Step 3 — Non-finite input and output.** Build a table-driven test over every app-path export's underlying Rust function: NaN or ±Inf in any numeric input must return `Err`, and every returned number must be finite. Extend `input_validation_gates.rs` and `nan_output_gates.rs`.
- [ ] **Step 4 — Panics.** In the browser, a panic traps and takes the worker with it.
  - Grep the production call chains for `expect(`, `[idx]` on user-supplied ids, and `unwrap_or` that hides an error.
  - Truncation test (K34): for every fixture JSON, parse and solve each prefix of length k (step by `len/200`) using the type the export parses (its `serde_json::from_str::<T>` in `lib.rs`). Every prefix must return `Err`; none may panic.
- [ ] **Step 5 — WASM vs native (K34).** Write a Node script that runs `solve_3d` through the built WASM on 5 fixtures from `engine/tests/fixtures/`, and a Rust test that writes native results for the same fixtures. Compare at ≤1e-12 relative.
- [ ] **Step 6 — Performance.** Build main's WASM into `/tmp/wasm-old` as `web/scripts/bench-wasm-boundary.mjs` expects, then run `npm run bench:wasm-boundary`. Report the serialisation share of total solve time on M and L, using W1 Step 5's split.
- [ ] **Step 7:** §1 Steps 5–7.

### Task 2.13: W3 — Model store, persistence, share links

**Scope:**
- `web/src/lib/store/`: `model.svelte.ts` (159K), `file.ts` (51K; `DEDAL_FILE_VERSION = '2.0'`, `migrateSnapshotV1ToV2` :54), `ui.svelte.ts`.
- Undo/history (`git grep -l -i -E 'undo|history' -- web/src/lib/store`).
- `web/src/lib/utils/url-sharing.ts`, `web/src/lib/section/migration.ts`, `web/src/lib/model/*`.

**Register:** K45, K46. **Branch:** `audit/w3-persistence`

- [ ] **Step 1:** `npx vitest run --project unit src/lib/store src/lib/utils src/lib/section/__tests__/migration.test.ts`
- [ ] **Step 2 — Round-trip property test.** Generate seeded random models covering every entity kind:
  - nodes, elements, releases, supports (including inclined and springs);
  - sections (including `composition`, `profileFamily`, `tl`, `built`), plates, stairs, curved members, joint designs, footings;
  - load cases and combinations.

  Assert deep equality through three paths: `.ded` save→load, the share-URL encode→decode (this decides K45), and undo→redo of each mutation.
- [ ] **Step 3 — Migration.** Every committed fixture from an older version must load and re-save idempotently (load→save→load equal). Decide K46: re-derive A/I on load, or flag the section.
- [ ] **Step 4 — Isolation and versioning.** A mutation in tab A must leave tab B unchanged. Enumerate the mutation methods (`grep -n -E '^\s+(add|remove|update|set|delete|move|paste)[A-Z]\w*\(' src/lib/store/model.svelte.ts`) and assert each one bumps the model version. W4 consumes this list.
- [ ] **Step 5 — Performance.** Time save and load, and measure peak memory, on the 48 MB 7-storey `.ded`. Measure undo snapshot cost per edit on L (allocation per keystroke) and share-URL encode time on M.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.14: W4 — Results invalidation

**Scope:** `web/src/lib/store/{results.svelte.ts,design-run.svelte.ts,verification.svelte.ts}` and every consumer that decides results are fresh.

**Register:** K47. **Branch:** `audit/w4-invalidation`

- [ ] **Step 1 — Edit × result matrix.** Rows are W3's mutation list. Columns are result kinds: linear, combinations, envelopes, advanced analyses, design run, verification, detailing, exports. Write one generated test that, for each cell, solves → mutates → asserts the result is either cleared or flagged stale as the matrix specifies. This decides K47.
- [ ] **Step 2:** Switch between 2D and 3D with results present; no result may cross over.
- [ ] **Step 3:** After restoring a project from file, the UI must not show any "verified" state for which no demands exist (K47).
- [ ] **Step 4 — Performance.** Profile one property edit on L: count store writes and derived recomputations per keystroke.
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.15: W15 — Importers and exporters

**Scope:**
- Importers: `web/src/lib/cad/` (207K), `lib/dxf/`, `lib/ifc/`, `lib/excel-import/` (`parse.ts`, `schema.ts`, `apply.ts`), `components/{CadImportWizard,DxfImportDialog,IfcImportDialog}.svelte`.
- Exporters: `lib/export/excel.ts`, the report popup.

**Register:** K50. **Branch:** `audit/w15-io`

- [ ] **Step 1 — Round trips.** XLSX export → re-import must equal the source model (K50). Parse the DXF export with the project's DXF importer and assert R12 structure.
- [ ] **Step 2 — Axes and units.** An IFC fixture with known orientation must import with gravity along −Z and correct local axes. Add one fixture per length unit (mm, cm, m) and assert the scaling.
- [ ] **Step 3 — Malformed files.** Truncated or garbage DXF, IFC and XLSX must produce a clear error and leave the model untouched; `apply.ts` must be all-or-nothing.
- [ ] **Step 4 — Performance.** Import time and peak memory on the largest fixture of each format. Time `cad` classify/infer at two drawing sizes.
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.16: W16 — Catalogues, generators, model tools

**Scope:**
- Data: `web/src/lib/data/{structural-grades,iram-wf,iram-tubes,steel-profiles,section-shapes,section-catalog,non-metal-grades,pro-examples}.ts`, `lib/profiles/`, `lib/grades/`, `lib/material/`; `engine/src/section/catalogue.rs`.
- Generators and tools: `lib/engine/generators/*`, `lib/model/*`, `lib/templates/`.

**Register:** K35, K42, K49. **Branch:** `audit/w16-catalogues`

- [ ] **Step 1 — Tabulated vs computed.** For every profile, compute A, Iy, Iz, J (and the principal inertias for angles) from its dimensions with `analyze_section` through WASM, and compare with the tabulated values. Record a per-family tolerance that explains fillet effects; outliers are data findings (K35).
- [ ] **Step 2 — Grades.** fy, fu and E against the material tables in `docs/codes/CIRSOC/markdown/` (301-2018).
- [ ] **Step 3 — Generators.** Every generator output, at default and edge options, must pass `analyze_kinematics_3d` (K42). Check topology invariants: diagonal direction for Pratt/Howe/Warren, no duplicate nodes, every member connected, and load cases present wherever promised.
- [ ] **Step 4 — Model tools.** `array-copy` and paste must merge or flag coincident nodes (K49, with W9). Check stair and footing geometry invariants.
- [ ] **Step 5 — Performance.** Generator time at the UI's maximum parameters. Catalogue contribution to the start-up bundle, from the `vite build` output.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.17: W7d — Other code families and capability gating

**Scope:** `web/src/lib/engine/codes/{us,eu,timber,masonry,cfs}/index.ts`, `codes/argentina/{section-shape,section-polygon}.ts`, `web/src/lib/codes/{maturity,roles,regulation,revisions}.ts`.

**Register:** K38 (`roleUsable`), K40, K41. **Branch:** `audit/w7d-gating`

- [ ] **Step 1 — Gating honesty.** Build a table from `maturity.ts` and `roles.ts`. Every capability the UI offers needs a test proving its check runs and returns a non-null result. Every UNSUPPORTED capability must be refused visibly; a silent PASS is a HIGH finding.
- [ ] **Step 2:** One worked example per family, run through the exact path the app uses. The reference is the one cited in that family's code comments.
- [ ] **Step 3:** Test unit conversions at the boundary of every family that uses non-SI inputs.
- [ ] **Step 4:** §1 Steps 5–7. Performance is shared with W7a's verification-pass timing.

### Task 2.18: W6 — 3D rendering

**Scope:** 37 commits since August (PRO drawing tools, shell contours, grid, highlight and picking).
- `web/src/lib/three/` (22 files): `rebar-scene.ts` 57K, `despiece-3d.ts`, `deformed-shape-3d.ts`, `diagram-render-3d.ts`, `load-arrows-batched.ts`, `section-profiles.ts`, `stress-heatmap.ts`.
- `web/src/lib/viewport3d/`: `scene-sync.ts` 52K, `results-sync.ts` 47K, `lod.ts`, `picking.ts`, `camera.ts`.
- `web/src/components/Viewport3D.svelte` (141K).

**Register:** K48, P2, P3, P4. **Branch:** `audit/w6-3d`

- [ ] **Step 1:** `npx vitest run --project unit src/lib/three src/lib/viewport3d`
- [ ] **Step 2 — Disposal.** In Playwright, load L then swap to S ten times; `renderer.info.memory` geometries and textures must return to their baseline. Read `renderer.info` through `web/src/lib/utils/e2e-hooks.ts`. If the hook is missing, add it behind the same production gate the build test enforces.
- [ ] **Step 3 — Sync correctness.** After each mutation kind from W3's list, mesh counts per entity kind must equal the model's counts, and highlight/base-colour caches must be keyed by entity and state. Check pick accuracy at every LOD level and on instanced/batched meshes.
- [ ] **Step 4 — Results drawn right.**
  - The deformed shape follows the displacement vector's direction (Z-up) at the stated scale.
  - `diagram-render-3d` plots M and V on the correct local axis, matching the 2D diagram for a planar model.
  - The heatmap ramp's min/max equal the result's min/max.
  - Reproduce the WebGL crash rate over 20 runs, capturing console errors and context-loss handling (K48).
- [ ] **Step 5 — Performance.** After W13 fixes the `viewport-perf` harness:
  - orbit/zoom frame time (p50/p95) and draw calls on the industrial shed and la-bombonera;
  - `scene-sync` and `results-sync` time per edit on L (performance marks);
  - tab-return lag (P2) via `tab-return-latency.spec.ts`;
  - rebar first-frame flush (P3).
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.19: W9 — PRO UI

**Scope:** `web/src/components/pro/`, excluding `pro/design/` (owned by W14): 98 files, 1.7 MB, **2 test files**, 179 commits since August. Largest components: `ProVerificationTab` 109K, `ProAdvancedTab` 89K, `ProConnectionsTab` 82K, `ProLoadsTab` 63K, `ProResultsTab` 58K, `ProAutoLoadsDialog` 44K, `ProShellTab` 42K, `ProSteelWorkflowTab` 39K, `generators/ProGeneratorsPanel` 36K, `ProProjectTab` 30K.

**Register:** K4, K24, K49. **Branch:** `audit/w9-pro`

- [ ] **Step 1 — Components must display, not compute.** Run `git grep -n -E '\b(phiMn|ratio|Mu|Vu|Nu|sigma|stress|util)\w*\b[^;]*[*/]' -- web/src/components/pro`. Each hit that does engineering arithmetic inside a `.svelte` file is untested computation: move it into `lib/` with a test, or justify it.
- [ ] **Step 2 — Errors surface.** For every `catch` in `components/pro` (`git grep -n catch -- web/src/components/pro`), a failing check must show the engine's message via `errorText`, never a blank row (K4).
- [ ] **Step 3 — Units and tables.** In an e2e on the 408-member model, spot-check that each displayed value and unit label matches its store value and unit. Solid-shell rows must render 8 values in 8 columns (K24).
- [ ] **Step 4 — Connectivity (K49).** After pasting a floor or a stair, the model must be connected (`analyze_kinematics_3d`), or the user must be prompted to merge coincident nodes.
- [ ] **Step 5 — Coverage.** List each tab's primary actions with no test that exercises them (the `data-testid` inventory reports 167 of 413 unreferenced). Add `@smoke` e2e coverage for the numeric ones.
- [ ] **Step 6 — Performance.** On L, measure tab-switch latency per tab (Playwright marks), `ProVerificationTab` render time with 400+ rows (virtualised or not), and `ProResultsTab` table render time.
- [ ] **Step 7:** §1 Steps 5–7.

### Task 2.20: W5 — 2D canvas

**Scope:** `web/src/lib/canvas/` (`draw-loads.ts`, `draw-despiece.ts`, `draw-diagrams.ts`, `label-layout.ts`, `draw-influence.ts`, `draw-modes.ts`, `theme.ts`, `draw-deformed.ts`), `web/src/lib/viewport/`, `web/src/components/Viewport.svelte` (117K).

**Register:** K56, K58. **Branch:** `audit/w5-canvas`

- [ ] **Step 1:** `npx vitest run --project unit src/lib/canvas src/lib/viewport`
- [ ] **Step 2 — Degenerate geometry.** Draw zero-length elements, coincident nodes, zoom levels of 1e-3 and 1e4, and negative coordinates into a spy `CanvasRenderingContext2D`. Every argument passed to a drawing call must be finite.
- [ ] **Step 3 — Diagram fidelity.** The M diagram lies on the side the project convention specifies. Invert the pixel mapping at each station and compare with `computeDiagrams` values.
- [ ] **Step 4:** Triage `basic-selection-permutations` (K56); fix the palette literals (K58, hygiene).
- [ ] **Step 5 — Performance.** Pan/zoom 60 frames on a large 2D model and record draw time and allocations. Time `label-layout` at two label counts to check for O(n²) overlap tests.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.21: W2r — Section TS and stress panels (light re-audit)

**Scope:** 65 commits in `lib/section` since W2 was audited.
- `web/src/lib/section/` (17 files).
- `web/src/components/stress/*` (`CrossSectionDrawing.svelte` 74K), `SectionStressPanel.svelte` 70K, `CirsocFlexPanel.svelte` 40K.
- `web/src/lib/engine/{section-stress,section-stress-3d,torsion-flow,warping,section-teaching}.ts`.

**Register:** K57, K35. **Branch:** `audit/w2r-section`

- [ ] **Step 1:** Read `git log --oneline 542fc664..origin/main -- web/src/lib/section web/src/components/stress` adversarially (`542fc664` is the PR133 merge that closed W2).
- [ ] **Step 2 — Parity.** Add the shapes introduced since then (`battens.ts`, built-up sections) to `engine/tests/fixtures/section-stress-parity.json`. Compare TS `torsion-flow.ts`/`warping.ts` with `analyze_section_torsion` and `analyze_section_torsion_field` on open and closed sections, including Bredt J for closed ones (K35).
- [ ] **Step 3 — Closed forms.** Principal stresses and the Mohr circle against closed form. Kern vertices: b/6 for a rectangle, d/8 for a circle.
- [ ] **Step 4:** Decide `kappa` (K57): use the engine value, or document why 1.2. Measure the cost of the rotated-digest round trip.
- [ ] **Step 5 — Performance.** Stress-panel open time for a complex section at two mesh densities.
- [ ] **Step 6:** §1 Steps 5–7.

### Task 2.22: W8 — Education and DSM

**Scope:**
- `web/src/components/edu/`: `EduExerciseView.svelte` 52K, `ExerciseAuthor.svelte` 42K, `EducativePanel.svelte`, `exercise-spec.ts`, `exercise-data.ts`, `diagram-sketch.ts`, `exercise-capture.ts`.
- `web/src/components/dsm/*`, `web/src/lib/engine/{solver-detailed,solver-detailed-3d,kinematic-report}.ts`, `KinematicPanel.svelte`.

**Register:** K22, K30 (stale `fef.rs` comment); Task 1.2 rows "Linear DSM" and "Kinematic analysis". **Branch:** `audit/w8-edu`

- [ ] **Step 1:** `npx vitest run --project unit src/components/edu`
- [ ] **Step 2 — DSM parity.** Run 20 seeded random frames (with releases, inclined supports, thermal and distributed loads) through `solver-detailed.ts` vs `solve_2d`, and through `solver-detailed-3d.ts` vs `solve_3d`. Displacements, reactions and end forces must agree within 1e-9 relative.
- [ ] **Step 3 — Grading.** Check the tolerance and units of `evaluateAnswer`. Grade on a cold start with no prior solve, looking for the PR133 lazy-vs-eager context pattern.
- [ ] **Step 4 — Sharing.** A malformed share link must give a clear error. Opening an exercise must leave the current model intact (recent fix; add a regression test if none exists).
- [ ] **Step 5 — Kinematics.** Compare `kinematic-report.ts` with `analyze_kinematics_2d` on textbook determinacy and mechanism cases, including `guidedZ` and `rollerZ` (K22, with E7).
- [ ] **Step 6 — Performance.** DSM step rendering on the largest model the wizard allows; confirm a size cap exists and is enforced.
- [ ] **Step 7:** §1 Steps 5–7.

### Task 2.23: E2r + E6r + E1p — Engine spot re-check and section-engine performance

**Scope:**
- **E2r:** `engine/src/solver/{dof,assembly,sparse_assembly,constraints,reduction,linear,load_cases,pre_solve_gates}.rs`
- **E6r:** `engine/src/element/{quad,quad9,curved_shell,plate,cable,fef}.rs`
- **E1p:** `engine/src/section/{plastic,mesh,torsion,warping}.rs`

**Register:** K26–K32, K35, P6. **Branch:** `audit/e-spot`

- [ ] **Step 1:** Read adversarially `git log --oneline 3500b149..origin/main -- engine/src/solver/{dof,assembly,sparse_assembly,constraints,reduction,linear,load_cases,pre_solve_gates}.rs` (PR138 merge) and `git log --oneline 3da9702c..origin/main -- engine/src/element` (PR148 merge).
- [ ] **Step 2 — Decide with tests:**
  - **K28:** an inclined and a regular support on one node must yield the merged restraint.
  - **K29:** `cw = Some(0.0)` gives an explicit error or no warping DOF.
  - **K26:** a degenerate curved shell returns an error, not identity-Jacobian stresses.
  - **K27:** record the convention decision.
  - **K30:** record keep/remove decisions and retire the stale comment at `fef.rs:152`.
- [ ] **Step 3 — Section performance.**
  - **K31:** benchmark plastic analysis on 3 sections at 2 mesh sizes. Add a fast path for triangles entirely inside or outside, and stop on interval tolerance. Outputs must be bit-identical or within a documented, test-pinned tolerance.
  - **K32:** build an edge→triangle map in `canonicalize`. Time torsion and warping at 2 mesh sizes; the expected scaling change is O(B·T) → O(B+T).
- [ ] **Step 4:** §1 Steps 5–7.

### Task 2.24: W12 — Backend, AI, functions

**Scope:**
- `backend/src/`: `capabilities/*` (build_model, edit_executor, explain_diagnostic, interpret_results, review_model, validate_snapshot, …), `middleware/auth.rs`, `providers/{claude,gemini,openai_compat,traits}.rs`, `routes/*`, `config.rs`, `error.rs`.
- `backend/tests/` (4 files); `web/src/lib/ai/`, `web/src/components/AiDrawer.svelte`; `functions/api/feedback.ts`.

**Register:** K2, K52. **Branch:** `audit/w12-backend`

- [ ] **Step 1:** `cargo test -p dedaliano-backend` and `cargo clippy -p dedaliano-backend -- -W clippy::all`.
- [ ] **Step 2 — Trust boundary.** Enumerate every route. An unauthenticated request must get 401; an oversized body must get 413. Error bodies must not leak provider keys, prompts or stack traces. Provider calls need a timeout and a token ceiling (K52).
- [ ] **Step 3 — AI output is untrusted input.** Build-model JSON from a provider must be validated against the engine input types before it reaches the app. NaN, huge arrays and unknown fields must be rejected; test through `edit_executor` and `validate_snapshot`.
- [ ] **Step 4 — Contract drift.** The backend deserialises engine types (`ResultSummary`, `SolverRunArtifact`). Round-trip a real snapshot from the web app. Whatever unknown-field policy E8 adopts also applies here.
- [ ] **Step 5 — `functions/api/feedback.ts`.** Validate input, enforce a size limit, and confirm there is some abuse or rate limiting; no secrets in responses.
- [ ] **Step 6 — Performance.** With a mock provider, measure `build_model` and `review_model` latency and peak memory when parsing the L snapshot.
- [ ] **Step 7:** §1 Steps 5–7.

### Task 2.25: W10 — UI shell, mobile, start-up

**Scope:** `web/src/App.svelte` (147K), `components/{ribbon,toolbar,floating-tools,property,tables}/`, `KeyboardShortcuts.svelte`, `TourOverlay.svelte`, `lib/tour/`, `MobileResultsPanel.svelte`, `lib/actions/`.

**Register:** P2 (with W6). **Branch:** `audit/w10-shell`

- [ ] **Step 1 — Dead controls.** Through the e2e hooks, click every ribbon, toolbar and floating-tool command; each must change state or open a dialog. Recent history fixed several dead buttons, so look for siblings.
- [ ] **Step 2 — Shortcuts.** Build the key→handler map. Keys must be unique, and every handler must be listed in the shortcuts dialog.
- [ ] **Step 3 — Mobile.** At a 390×844 viewport, the mobile results panel must show the same numbers as desktop for the M model.
- [ ] **Step 4 — Start-up performance.** Serve a production build (`npm run build && npx vite preview`). Over 10 runs, measure time to interactive and time to `__stabileo.solverReady()`. Record the bundle sizes from the build output, and the time to switch between Basic and PRO.
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.26: W17 — Public site: landing, blog, prerender

**Scope:** `web/src/components/{landing,blog}/`, `web/src/lib/blog/`, `web/scripts/prerender.ts`, `web/public/`, `.github/workflows/deploy-gh-pages.yml`.

**Register:** K1, and the landing suite that wedges under software GL (comment in `ci.yml`). **Branch:** `audit/w17-site`

- [ ] **Step 1:** Act on Task 0.3's classification of K1: fix it, or record it with the root cause.
- [ ] **Step 2 — Numeric claims.** Every worked number in a blog post (for example, the CIRSOC 201 post) gets an assertion that reproduces it through the app's code path.
- [ ] **Step 3 — Routing.** On a local production build, check the `404.html` bounce and trailing-slash URLs (regressions fixed in #172 and #184).
- [ ] **Step 4 — Performance.** On the production build, measure landing LCP and total blocking time with a `PerformanceObserver` in Playwright, and prerendered page weight. Check whether the hero's continuous `requestAnimationFrame` loop is what wedges software GL.
- [ ] **Step 5:** §1 Steps 5–7.

### Task 2.27: W11 — i18n

**Scope:** `web/src/lib/i18n/` (23 files, 4.2 MB) and the `locale-parity` and `pro-flow-coverage` tests.

**Register:** K51. **Branch:** `audit/w11-i18n`

- [ ] **Step 1 — Full parity.** Compare key sets across every offered locale, not just `design.*`. Detect cases where the `tAt` fallback hides a missing key in de/pt.
- [ ] **Step 2 — Numbers in strings.** Grep locale values for digits, `CIRSOC`, `kN` and `MPa`, and cross-check each against the code constant it describes (the pattern behind `noGeomMsg3`).
- [ ] **Step 3:** List the 423 Spanish literals in the detailing engine and assign their extraction to W14.
- [ ] **Step 4 — Performance.** Are dictionaries loaded lazily per locale or all at start-up? Measure their share of the start-up bundle (shared with W10 Step 4).
- [ ] **Step 5:** §1 Steps 5–7.

---

### Task 2.28: W18 — Explained steps (`web/src/lib/engine/steps`)

This module prints the numbers a student reads as the solution: 8.9 k lines and 34 files, all written after this plan.
- [ ] Oracle: for each step family, compare the step's final numbers with the solver's result on the same model; the steps must reproduce the solve, not a parallel calculation that can drift.
- [ ] Walk each family's catalogue models and a seeded set of generated ones.
- [ ] Find where a step can print a value the model does not have: a refusal shown as a number, or a unit dropped.

### Task 2.29: W19 — Force method (`web/src/lib/engine/force-method`)

1.8 k lines, written after this plan.
- [ ] Oracle: the stiffness solve on the same statically indeterminate models, reactions and end moments to 1e-9 relative.
- [ ] Check the choice of redundants: a degenerate or singular choice must be refused, not solved.
- [ ] Check the degree of indeterminacy against the kinematic count (`kinematic-2d`).

## Phase 3 — Close-out

### Task 3.1: Re-measure, reconcile, publish

**Files:**
- Modify: `docs/audits/2026-09/perf-baseline.md`, `docs/audits/2026-09/ledger.md`, `docs/BENCHMARKS.md` (inventory stamp)
- Create: `docs/audits/2026-09/summary.md`

- [ ] **Step 1:** Re-run Task 0.4 on the final main SHA and add "after" columns. A regression over 10 % on any workload, without a correctness fix that justifies it, is a finding.
- [ ] **Step 2:** Run `make test-inventory` and update the stamp in `docs/BENCHMARKS.md` in the same commit.
- [ ] **Step 3:** Reconcile: every register row K1–K58, P1–P9 and C-1…C-8 has a ledger outcome of `fixed`, `deferred` (with reason and owner), `not-a-bug` (with its deciding test), or `open` (with owner).
- [ ] **Step 4:** Write `summary.md`:
  - counts by severity and module;
  - the ten most important fixes;
  - the deferred list with owners;
  - the perf before/after table;
  - the tests and gates this audit added.
- [ ] **Step 5:** Commit `docs(audit): 2026-09 audit summary`.

---

## Status table (the queue's source of truth)

Status: ☐ todo · ◐ in progress · ✔ done (date, PR)

| Task | Module | Status | PR | Headline findings | Deferred |
|------|--------|--------|----|-------------------|----------|
| 0.1–0.4 | Baseline (includes K1 triage) | ◐ 2026-09-30 | | Main red from #231: contrast of the quantities hint (fixed); Node 25 harness defect (fixed); TS baseline 463 → 456 | |
| 1.4 | C-2: the 3D-mode check (`is3DWorkspace` + gate) | ◐ | #247 | 36 checks left PRO out; PRO context menu had no local-axes entry | |
| 1.5 | C-8: tests of behaviour, not source text | ◐ | | | |
| 1.6+ | C-1, C-3…C-7, C-2 tolerances | ☐ | | | |
| 1.1 | WASM reachability map | ☐ | | | |
| 1.2 | Implementation map | ☐ | | | |
| 1.3 | Differential tests | ☐ | | | |
| 2.1 | W7a CIRSOC 201 | ☐ | | | |
| 2.2 | W14 RC detailing | ☐ | | | |
| 2.3 | W7b Steel and connections | ☐ | | | |
| 2.4 | W7c Loads | ☐ | | | |
| 2.5 | W1 Solver bridge | ☐ | | | |
| 2.6 | E9 Postprocess | ☐ | | | |
| 2.7 | E5 Dynamics | ☐ | | | |
| 2.8 | E3r Sparse linalg | ☐ | | | |
| 2.9 | E4r Nonlinear | ☐ | | | |
| 2.10 | E7 Special models | ☐ | | | |
| 2.11 | W13 Test/CI honesty | ☐ | | | |
| 2.12 | E8 WASM boundary | ☐ | | | |
| 2.13 | W3 Persistence | ☐ | | | |
| 2.14 | W4 Invalidation | ☐ | | | |
| 2.15 | W15 Import/export | ☐ | | | |
| 2.16 | W16 Catalogues/generators | ☐ | | | |
| 2.17 | W7d Other codes, gating | ☐ | | | |
| 2.18 | W6 3D rendering | ☐ | | | |
| 2.19 | W9 PRO UI | ☐ | | | |
| 2.20 | W5 2D canvas | ☐ | | | |
| 2.21 | W2r Section TS | ☐ | | | |
| 2.22 | W8 Edu and DSM | ☐ | | | |
| 2.23 | E2r/E6r/E1p spot + section perf | ☐ | | | |
| 2.24 | W12 Backend/AI | ☐ | | | |
| 2.25 | W10 UI shell | ☐ | | | |
| 2.26 | W17 Public site | ☐ | | | |
| 2.27 | W11 i18n | ☐ | | | |
| 2.28 | W18 Explained steps (`lib/engine/steps`) | ☐ | | | |
| 2.29 | W19 Force method (`lib/engine/force-method`) | ☐ | | | |
| 3.1 | Close-out | ☐ | | | |
