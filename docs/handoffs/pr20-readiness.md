# PR20 — readiness

**Scope is closed.** Bauti has accepted the current scope with the debts listed in §3. No further
redesign or product work belongs in this PR.

**Technical state: ready for Diego's review. NOT mergeable, and no post-integration gate has been
run.** The base moved 37 commits ahead and the integration is prepared but unverified. See §5 and
§5b — which also withdraws a diagnosis of mine that was wrong.

**Manual QA: NOT done.** `pr20-qa-manual.md` is the checklist; nobody has walked it. Nothing in
this document should be read as saying otherwise.

Branch `feat/pro-visual-system`, PR #125 (base `pr/19-rc-cad-constructibility`), at `4630818f`.

---

## 1. What is finished

| Area | State |
|---|---|
| PRO design workflow | ✅ six stages, stated order, navigable strip |
| Global and per-family design | ✅ census and seven states per family, before any run |
| Floor design | ✅ its own contract: what it does, leaves alone, and what comes next |
| Coordinated detailing | ✅ ranked review screen, conflict → member and → sheet routing |
| Documents | ✅ a stage of its own, with the issue requirement in text |
| 3-D viewer | ✅ three entry points, one `openRebar3D` operation |
| Autosave and restore | ✅ including the provisional/torsion member lists |
| `.ded` round trip | ✅ 48 MB for the 7-storey building, reopened on a fresh context |
| English / Español / Português | ✅ **the interface**. Not the engine memos — see §3 |

## 2. Automated gates — the run these numbers come from

Full suite on a dedicated port (4293), started at load average 2,47 on fourteen cores.
**These are the most recent gates and they are the ones reported.**

| Gate | Result |
|---|---|
| typecheck | ✅ 479 vs baseline 490 — no new type errors |
| unit suite | ✅ 5989 passed · 12 skipped · 1 todo · 321 files |
| build tests | ✅ 14 passed |
| production build | ✅ 13,17 s |
| locale parity | ✅ 60 passed · 1 todo |
| smoke | ✅ 37/37 after retargeting 12 `test obsoleto` failures |
| **full Playwright suite** | ✅ **402 passed · 1 failed · 4 skipped · 1 did not run · 30,5 min** |

`ded-roundtrip`, `project-restore`, `tab-reactivation`, `rebar-3d`, `viewport-cost`, families,
floors, detailing, documents, Ver en 3D, preview and sticky headers all pass **inside that run** —
they were not run separately and then quoted as if they were independent evidence.

**The one failure**: `rc-design-visual › @slow visual baselines`, 696→697 px, 645 pixels differing,
ratio 0,03 — the same signature in every run of this session including one with all changes
stashed. Classified **screenshot**. **NOT updated**, and it must not be until Bauti confirms the
overlay legend by eye. Its `mode: 'serial'` sibling is the "1 did not run".

## 3. Debts accepted for later PRs

Accepted explicitly by Bauti. **None of these is to be fixed inside PR20.**

| Debt | Why it is not here |
|---|---|
| Some right-panel visual refinements | Diminishing returns; the panel is coherent, not perfect |
| **423 Spanish literals** in the detailing engine, rendered in every language | Extracting them means editing the modules that compute punching shear, splice lengths, bent-up-bar admissibility and footing flexure. That is an engine refactor and deserves the engine's own tests as its gate |
| Tab-return lag on large models | Reproduced: 7-storey + viewer open, first click 1–4 s. **Present on PR19 too**, whose worst cases are worse (3088 vs 1504 ms on the toggle). Not a PR20 regression. Scene rebuilds, WebGL context loss and canvas creation are all ruled out — every delta zero across ten cycles on two branches. Cause not located |
| The 1 px snapshot | Needs a human eye, then a commit of its own |
| Conflict inspector has no complete keyboard route | Real accessibility gap, out of this pass's scope |
| Viewer rail not grouped by family | Documented, not started |
| Toasts and visual density | Toast can cover the command row at 1280×720; the stage strip wraps leaving a dangling chevron. Both documented, both design decisions |
| Further preview and workflow improvements | — |

## 4. Automated QA vs manual QA — what the 402 do and do not mean

The suite proves **facts**: the control exists, the count is right, the order in the DOM is the
order claimed, the focus returns, `scrollWidth ≤ clientWidth`, the three languages render, the
scene census matches across three entry points, the 48 MB file round-trips.

It cannot decide **judgements**: whether a 1:50 elevation is legible at the size it is shown,
whether a sentence explains what it claims to, whether three ways to reach the 3-D view is helpful
or confusing, whether a run that cannot be cancelled is acceptable at that length, and whether the
whole thing reads as one product.

Two specific things only a person can catch here:

- a **corrupted 48 MB `.ded`** is a lost day of work, and the round trip deserves one human open;
- the engine memos being Spanish-only is a **decision**, and it is Bauti's, not a test's.

`pr20-qa-manual.md` marks with ⚠ the places where this pass changed a judgement rather than a fact
— those are where a second opinion is worth the most.

## 5. The blocker that is not about the code

`gh pr view 125` reports **`mergeable: CONFLICTING`**.

The base branch `pr/19-rc-cad-constructibility` has advanced **37 commits** since this branch left
it — it merged main via PR #139. PR20 is 43 commits ahead of it. Bringing them together touches
**366 files** and conflicts in **9**:

```
web/e2e/project-restore.spec.ts
web/e2e/rebar-toggles.spec.ts
web/playwright.config.ts
web/src/App.svelte
web/src/lib/engine/detailing/__tests__/beam-reinforcement-audit.test.ts
web/src/lib/engine/detailing/__tests__/top-steel-projections.test.ts
web/src/lib/export/__tests__/design-families.test.ts
web/src/lib/export/__tests__/scene-completeness.test.ts
web/src/lib/three/__tests__/support-gizmo-sharing.test.ts
```

**This was not done**, and deliberately. Merging 366 files of someone else's work into PR20
invalidates every number in §2 — the gates would have to be re-run from scratch, and a conflict
resolved wrongly in `App.svelte` or `playwright.config.ts` is exactly the kind of thing that turns
a green branch red for reasons that have nothing to do with what PR20 changed.

It is also a decision about ORDER, and that decision is Bauti's:

1. **QA first, then integrate.** Walk the checklist against the branch as it stands and as it was
   tested, then merge the base and re-run the gates. Costs one extra gate run; QA is done against
   exactly what was measured.
2. **Integrate first, then QA.** Merge the base now, re-run everything, then walk the checklist
   against the integrated result. QA is done once, against what will actually merge — but if the
   integration breaks something, the QA window slips.

The second is usually right when the base has moved this much. Either way the gates in §2 have to
be re-run after the integration, and this document must be updated with the new numbers.

## 5b. The base integration, and a diagnosis of mine that was wrong

An earlier version of this section said the base shipped TypeScript against WASM bindings it had
never regenerated, and a handoff asked Diego to fix it. **That was wrong, and both are withdrawn.**

### What is actually true

`web/src/lib/wasm/` is in `.gitignore` and **not one file under it is tracked**:

```
$ git check-ignore -v web/src/lib/wasm/dedaliano_engine.d.ts
.gitignore:30:web/src/lib/wasm    web/src/lib/wasm/dedaliano_engine.d.ts
$ git ls-files web/src/lib/wasm/
(empty)
```

The bindings are a **local build artefact, per worktree**, produced by `npm run wasm`. There is
nothing published to be out of date, so there was never a base defect and nothing for anyone else
to fix.

### What actually happened

Two worktrees of this repo, the same commit range, different local builds:

| Worktree | `analyze_section_torsion_field` in the local bindings |
|---|---|
| `stabileo-steel` | **5** — freshly built |
| `stabileo-landing` | **0** — stale |

The integration's two "new" type errors were this worktree's stale artefacts. That is also why
`feat/pro-steel-family` typechecks clean against the same `main`: its worktree had built the WASM
more recently. The evidence was available the whole time and I did not go looking for it until
another task made me compare the two directories.

**If typecheck fails on `analyze_section_*_field`, run `npm run wasm` in that worktree.** It is not
a base defect, not a solver problem, and not a reason to escalate.

### So what is the state of the integration?

`pr20-base-integration-wip` @ `dd0dcf22` holds the merge with all 9 conflicts resolved by hand,
each documented in its commit message. It was parked on the strength of the wrong diagnosis. With
fresh local bindings it should typecheck; that has not been re-measured, and no post-integration
gate has been run, so nothing here is claimed as green.

The genuine facts about merging remain: the base moved 37 commits, the integration touches 366
files, and every gate in §2 describes `feat/pro-visual-system` against the base PR20 was developed
on — not the integrated tree.

---

## 6. Merge

The repository allows **squash, merge commit and rebase**. Squash is recommended, for two reasons:

- the 46 `Co-Authored-By` trailers vanish on their own — a squash writes one new message and that
  is the whole record, so no history rewrite and no force-push is needed
  (`pr20-authorship-cleanup.md` exists for the case where squash is not used);
- 43 commits of iteration on one feature is not history anyone will read.

**The squash commit's author.** GitHub attributes a squash commit to the person who clicks Merge,
so it will be Bauti's if Bauti merges it. What it does NOT do automatically is drop the trailers:
GitHub's default squash message concatenates the individual commit messages, trailers included. The
message must be **replaced by hand** in the merge dialog. That is the single step that decides
whether this cleanup is needed at all.

## 7. Where this stands

- **Technically ready for review.** Gates green, one known screenshot, scope closed.
- **NOT mergeable as it stands** — the base moved; §5.
- **Manual QA pending.** Not started. PR20 stays in draft until it is walked.

---

## Appendix — earlier runs and how each failure was classified

## 2. The clean run, and how each failure is classified

The categories the brief asked for, applied honestly:

| Class | Meaning |
|---|---|
| **producto** | the application is wrong |
| **test obsoleto** | the test describes a surface that has since moved |
| **infraestructura** | the harness or the environment, not the app |
| **saturación** | the app and the test are both fine; the machine was not |
| **screenshot** | a pixel difference from font/antialiasing |

### The clean run at `64c28f81`

Started only after the load average fell below 6; the machine still drifted to 6–9 during it, which
is visible in the one heavy failure.

| # | Test | Class | Evidence |
|---|---|---|---|
| 1 | `ded-roundtrip › the 7-storey project survives the file` | **saturación** | `the solve did not finish in 480 s`, worker pool UP, no fallback. The same solve is ~9 s idle, and this spec passed at 5/5 twice earlier in the session. |
| 2 | `landing › the embed is rendered at native size` | **infraestructura (flake)** | `pointer y offset expected ≤3, received 7`. **Re-run in isolation: passes in 19,2 s.** Landing was never touched by this branch. |
| 3 | `rc-design-visual › overlay legend` | **screenshot** | 696→697 px, 645 px differing — the identical signature recorded below. |

Nothing classified as **producto** and nothing as **test obsoleto**.

### The post-fix run at `5cb9088d` + the stage redesign

**323 passed · 9 failed · 4 skipped · 1 did not run · 46,0 min.** Nine failures, three causes.

| # | Test | Class | Evidence |
|---|---|---|---|
| 1 | `ded-roundtrip › the 7-storey project survives the file` | **producto (del test)** — see §2.1 | `the solve did not finish in 480 s`. Fifth consecutive occurrence at position #2. **Not saturation.** Diagnosed and fixed. |
| 2–7 | `rebar-3d › the drawings exported…`, `rebar-viewport-cost` × 5 | **infraestructura** | Every one: `Failed to load resource: net::ERR_INTERNET_DISCONNECTED`. The machine's network dropped during a contiguous window; six tests fell inside it. |
| 8 | `rebar-3d › the workspace is quiet` | **infraestructura** | `Test timeout of 60000ms exceeded while setting up "pro"` — the same window, one test earlier. A page that cannot fetch never boots. |
| 9 | `rc-design-visual › overlay legend` | **screenshot** | 696→697 px, 645 px differing, ratio 0,03 — the same signature as every prior run. |

Nothing classified as **producto (de la aplicación)** and nothing as **test obsoleto**.

### 2.1 `ded-roundtrip`, diagnosed rather than classified

Five runs were written off as saturation on the strength of one line of output. That line named
neither the stage that stalled nor a baseline to compare it against, so it could not have
supported the classification it was given. Two things were done about that.

**The chain now times itself.** `prepare()` prints a duration per stage. Measured on a quiet
machine: boot 0,4 s · load + solve **0,8 s** · design all 9,1 s · detailing 4,3 s · floor design
3,5 s · scene census 8,6 s — about 27 s for the whole preparation. A solve that has not finished
in 480 s is not a busy machine; it is six hundred times the baseline, and it is a stall.

**The cause.** The test declared its fixtures as
`{ preparedPage: page, preparedProject, pro: fresh }`. Playwright builds every declared fixture
**before the body runs**, so `pro` booted a second full application — its WASM module and its
worker pool — alongside the 7-storey solve that `preparedProject` was in the middle of. Three live
browser contexts, each holding a solver. It was the only test in the suite that did this, which is
exactly why the identical preparation succeeds for `rebar-3d.spec.ts`, whose uses of the same
fixture never hold a `pro` page next to it.

**The fix, and what it is not.** The fresh page is not needed until the 48 MB file has been
written, minutes after the solve. It is now created in the test body at the moment it is first
used, and closed by hand. No budget was raised, no assertion weakened, no coverage dropped: it is
the same fresh context opening the same file and asserting the same things. Isolated: **5/5 in
1,3 min**, the `@slow` case itself in 18,2 s.

### 2.2 After the fix — and a machine that stopped being trustworthy

Two runs were started after the fix landed and **neither produced a clean measurement**, for a
reason that has nothing to do with this branch.

**Run A (full suite).** Reached test 217 of 337 and was killed by the harness, not by a test.
`ded-roundtrip` **passed in-suite, at the same position #2 that had failed five times**, with the
preparation timing normal (`load + solve 0,1 s`). One failure in those 217:
`landing › the embed is rendered at native size` — the flake already recorded below, on a file
this branch never touched. **The Priority 2 fix is confirmed in-suite as well as isolated.**

**Run B (`rebar-3d` + `rebar-viewport-cost` + `ded-roundtrip`).** 33 passed, 3 failed:

| Test | Class | Evidence |
|---|---|---|
| `ded-roundtrip` × 2 | **infraestructura** | `net::ERR_ADDRESS_UNREACHABLE`. Not the solve: the preparation completed, `load + solve` measured **0,0 s**. |
| `rebar-viewport-cost › 7-storey › showing columns with the markers off` | **saturación** | A latency budget: 5 282 ms against 2 500 ms. Measured immediately after the run, with nothing of this work running: **load average 16,5 / 19,3 / 16,9 on a 14-core machine**, with a SECOND Claude Code session, Chrome and Spotlight indexing all live. A 2 500 ms budget cannot survive that, and the same minute produced the packet loss above. |

Run B finished 36 passed · 3 failed · 13,6 min.

**The honest statement about the machine.** Across the last three runs the host has produced
`ERR_INTERNET_DISCONNECTED` (six tests, one contiguous window) and `ERR_ADDRESS_UNREACHABLE`
(two tests). That is not a property of PR20 and it is not saturation either — it is a host whose
network is dropping. **No full-suite result taken on it since is worth quoting**, and the last
uninterrupted full run remains the one at the head of this section.

**What is therefore NOT verified**: one uninterrupted full-suite pass with the review screen and
the fixture fix both in. That is the single outstanding measurement, and it needs a host that is
not simultaneously running another agent session — the operator cannot see that contention from
inside a test report, which is the third time this session that an invisible neighbour has cost a
run. Check `uptime` before starting one; below 6 is the threshold this document has used
throughout.

### Standing classification, from repeated measurement across this session

| Test | Class | Evidence |
|---|---|---|
| `rc-design-visual › overlay legend` | **screenshot** | 696→697 px, 645 px differing, ratio 0,03 — byte-identical signature across five runs, including a run with every change of this session stashed. The three English strings it renders (`design.overlay.*`) were never edited: `git diff` shows zero removals from `en.ts`. Its describe block is titled "(non-blocking)". Its sibling test is `mode: 'serial'`, so it also reports "1 did not run". |
| `rc-design › B15` | **saturación** | 4,0 s in isolation; >60 s under a loaded worker. Measured directly: 150 smoke tests → 1 failure, 139 → 0. The `@smoke` footprint of the new language tests was trimmed for exactly this reason, and smoke then measured 152/152. |
| `ded-roundtrip` (7-storey), `project-restore`, `tab-reactivation` (7-storey), `rebar-3d` journey | **saturación** | All fail with one signature: `page.evaluate` on the 7-storey solve exceeding its budget, with the worker pool UP and no fallback. The same solve is ~9 s on an idle machine. Each has passed on a calm machine in this session — `rebar-3d` + `viewport-cost` at 34/34 in 8,4 min with load ≈ 4, and the same pair failed at load ≈ 10. |

**Why "saturación" is not a euphemism here.** `fixtures.ts` documents the measurement that
established it: a 7-storey solve that takes about ten seconds idle exceeded FOUR MINUTES on a
worker that had been busy for ten, with the parallel pool up and no fallback to the sequential
solver. It is a real, known fragility of this suite on a contended machine, and it is the reason
`prepared-building.ts` exists — the observers no longer solve at all. What remains is the handful
of specs that legitimately must solve.

**A measurement hazard worth recording.** Two runs in this session were invalidated by contention
the operator could not see: a zombie `vitest` worker pool at 478 % CPU competing with Playwright,
and a stretch at load average 25 on a 14-core machine caused by processes outside this work. Any
timing-sensitive result taken during those is worthless. The run reported above was started only
after the load average fell below 6.

---

## 3. Text that is still not localised

**423 Spanish literals across 21 files** in `lib/engine/detailing`, reaching real surfaces in
every language. This is the largest remaining gap in PR20 and it is NOT fixed.

| Literales | Archivo | Superficie donde se ve | Ejemplo |
|---:|---|---|---|
| 54 | `document-render.ts` | Sheet notes, report sections, DXF annotation | «PARA REVISIÓN — NO APTO PARA CONSTRUCCIÓN…» |
| 44 | `generate-beam.ts` | Bent-up-bar refusals → assembly notes, sheet notes | «anclaje doblando la armadura dentro del alma…» |
| 43 | `footing-flexure.ts` | FootingMatPhysicalPanel → «Memoria de la geometría» | «momento externo en una sección por un plano vertical…» |
| 39 | `generate-column.ts` | Assembly notes | «La cantidad de barras pasa de ${lo.bars.count} a ${hi.bars.c…» |
| 36 | `foundation-check.ts` | Foundations panel findings | «resistencia a corte en una dirección…» |
| 31 | `footing-dowel-cage.ts` | Footing CAD handoff notes | «transmisión de fuerzas por armadura en la interfaz columna-b…» |
| 29 | `punching-shear.ts` | Footing panel → «Punção» steps; floor design notes | «secciones críticas para corte en dos direcciones…» |
| 24 | `beam-top-steel.ts` | Top-steel notes → status panel chip, schedule | «cada doblez del estribo debe contener una barra longitudinal…» |
| 20 | `wall-design.ts` | Walls table notes | «límites de la armadura en tabiques…» |
| 17 | `floor-design.ts` | Floor run unsupported list | «transmisión de fuerzas por armadura…» |
| 16 | `slab-design.ts` | Slabs table notes | «toda la carga se transmite en la dirección corta, se diseña …» |
| 15 | `drawings.ts` | Drawing labels/notes | «${provisionalMembers.length} elemento(s) de esta lámina (${p…» |
| 12 | `footing-mat-geometry.ts` | FootingMatPhysicalPanel → geometry.steps | «recubrimiento mínimo del hormigón colado en contacto con el …» |
| 10 | `run-detailing.ts` | Skip reasons, coordination notes | «${j.jointId}\|${la < lb ? la : lb}\|${la < lb ? lb : la}…» |
| 9 | `footing-mat-anchorage.ts` | FootingMatPhysicalPanel → anchorage.*.steps | «el anclaje de la armadura debe cumplir con el Capítulo 25…» |
| 7 | `coordinate-floor.ts` | Floor coordination notes | «${initial} conflicto(s) detectado(s); se intenta la escalera…» |
| 5 | `floor-transverse.ts` | Floor transverse notes | «armadura de corte mínima en losas…» |
| 4 | `structure-drawings.ts` | Structure drawing labels | «Corte horizontal en z = ${atZ.toFixed(2)} m — ${cut} barra(s…» |
| 3 | `classify.ts` | Classification notes | «separación máxima de la armadura transversal a lo largo del …» |
| 3 | `assembly.ts` | Assembly migration notices | «Hay elementos que no superan su verificación individual.…» |
| 2 | `splice.ts` | Bar schedule / detail memo (mostly EngineMessage already) | «longitud de empalme por yuxtaposición en tracción…» |

**Total: 423 literales en 21 archivos.**

**Why they were not extracted.** Every one of them is inside the detailing engine or an authority
module. Moving them to keys means editing the files that compute punching shear, splice lengths,
bent-up-bar admissibility and footing flexure — the modules this pass was explicitly told not to
touch, and the ones whose output the 114-verified / 5-provisional result depends on. A mechanical
extraction across 21 calculation files is not a translation task; it is an engine refactor, and it
deserves its own PR with the engine's own tests as the gate.

**What WAS extracted, because it was safe.** The five calculation-memo titles — Flexure, Shear,
Flexo-compression, Torsion, Biaxial (Bresler) — are labels `getCodeDetail` assembles in a
transitional adapter, not text a CIRSOC adapter produced and not a formula. They now carry a
`titleKey` alongside the unchanged `title`, and the panel prefers the key. `title` is byte-identical
so every other consumer is untouched.

**What is already correct.** `lib/codes` and `lib/engine/loads` are pure: they emit
`{ key, params }` and `engine-text.ts` renders them at the boundary. `engine-purity.test.ts` now
requires those keys in all three offered locales, which closed 62 of them in this session.
`splice.ts` is largely on that path already (5 of its strings are `msg()`).

**So the honest statement about the three languages** is: the PRO *interface* is complete in
English, Spanish and Portuguese — 894 keys were added and a gate enforces it — and the *calculation
memos and document notes generated by the detailing engine are Spanish-only, whatever language the
interface is in*. Both halves are true and the second one is not a detail.

---

## 4. What still needs a human

- **Manual QA of the redesigned workflow.** The UX pass was audited with screenshots and is covered
  by 12 assertions, but hierarchy, density and "does this read as one product" are judgements a
  test cannot make. Specifically: the stage strip across a full project; the enlarged sheet dialog
  with a large real drawing; the 3-D viewer at 1280×720; and the three languages side by side.
- **The `.ded` of a 7-storey project**, saved and reopened by hand. It is covered end to end by
  `ded-roundtrip.spec.ts` at 48,0 MB, but this is a data-export path and deserves one human look.
- **Whether a transient toast may cover the primary commands** at the smallest supported width.
  Observed, deliberately not patched — it is a design decision.
- **The 1 px snapshot.** Update it in a commit of its own, after someone confirms by eye that the
  legend is unchanged. It was not updated automatically at any point in this work.

---

## 5. Debt, by where it lives

**Localisation** — the 423 above. Plus: the eleven unoffered dictionaries remain ~790 keys behind
(nothing renders them; `OFFERED_LOCALES` is a single edit away from re-enabling one).

**Suite fragility** — the 7-storey solve under contention. The starvation fix removed nine of the
thirteen full setups; what remains is irreducible without giving up coverage.

**Coverage** — 167 of the 413 RC-surface test ids are still referenced by nothing
(`pr20-pro-design-matrix.md`). The riskiest named there are `cmd-cancel`, `footing-delete` (deletes
without confirmation) and the entire conflict inspector, which is also unreachable by keyboard.

**UX** — the counts strip is still an undifferentiated monospace line; the stage strip wraps at
1280×720 with a dangling chevron; the sheet `<fieldset>` keeps a native legend border.

**Still experimental, and labelled as such in the product** — provisional-biaxial proposals, the
torsion notice (deferred to PR21), and the CAD handoff, which states in its own words that its
output is a semantic handoff and not a drawing.

---

## 6. Recommendation

**Keep PR20 in draft.** Nothing found in this pass is a product defect, and every gate that can be
run without a human is green on a quiet machine. What is missing is not a fix — it is a judgement
(the manual QA) and a piece of work that was correctly refused (the engine's 423 strings, which
cannot be extracted without editing calculation modules that were out of bounds).

The two things that would change this recommendation, in order:

1. A person walks the redesigned workflow once, in all three languages.
2. A decision on the 423: extract them in a dedicated engine PR, or accept Spanish-only calculation
   memos and say so in the product rather than in a handoff document.
