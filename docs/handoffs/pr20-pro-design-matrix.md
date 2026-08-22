# PR20 — the PRO `Diseño → Diseño` surface, control by control

**What this is.** Every control, disclosure, filter, state, export and empty state on the PRO
reinforced-concrete design workflow, with what it does, what it writes, where the result shows,
and — measured rather than asserted — whether a test touches it.

**What this is not.** It is not a claim that the covered half works. The coverage column says a
spec *references* the control's test id; for the ones where the reference is only a wait or a
locator on the way to something else, the row says so. No box here is green because it looked
like it should be.

## Method

1. Every `data-testid` in `components/pro/design/**`, `ProDesignTab`, `ProRcWorkflowTab` and
   `ProProjectFileActions` was extracted from the markup together with its element type, its
   `disabled` expression, its `role` and its `aria-*` attributes.
2. Each id was then searched for across `e2e/**` and every `__tests__/**` in `src/`.
3. Counts, at the commit this was written from:

| | before this pass | after |
|---|---|---|
| test ids on the RC design surface | **413** | 413 |
| of which interactive controls | **176** | 176 |
| ids a Playwright spec references | 237 | **241** |
| ids only a unit test references | 5 | 5 |
| ids **nothing** references | **171** | **167** |

The four that moved are the ones `e2e/pro-design-gates.spec.ts` closes in §1, §3 and §9. The
remaining 167 are not all defects — some are read-outs whose value is asserted through a
neighbour — but every one of them is listed below as **PENDIENTE** rather than assumed.

---

## 1. The pipeline, and what gates each step

The commands are a chain, and each one is disabled until its predecessor has produced something.
This is the single most important table in the document: a disabled command in PRO is always a
statement about the project, never about the button.

| Command | `data-testid` | Enabled when | Why it is disabled, visibly | Writes | Shows on |
|---|---|---|---|---|---|
| Calcular demandas | `cmd-compute-demands` | `hasResults && !busy` | placeholder `design-placeholder-solve` replaces the table with "solve first" | `verificationStore.demandRevision` | design table, `design-counts` |
| Verificar (código) | `cmd-code-check` | `hasResults && hasCombinations && !busy && concreteReady` | `banner-no-combinations`; `concrete-code-gate` + `goto-project-regulations` when no concrete code is bound | outcomes in `verificationStore` | row badges, `summary-count-*` |
| Diseñar selección | `cmd-autodesign` | same **and** `selectedCount > 0` | count in the label is `0` | `element.reinforcement`, run summary | table, `banner-changed` |
| Diseñar no diseñados | `cmd-autodesign-undesigned` | inside `cmd-autodesign-menu` | menu is closed | same | same |
| Diseñar todo | `cmd-design-all` | `hasResults && hasCombinations && !busy && concreteReady` | as above | same | same |
| Diseñar familias | `cmd-design-families` | `canDesign && selection.length > 0 && !running` | no family box ticked | frame **and** floor families | `design-family-result` |
| Generar detallado | `cmd-generate-detailing` | `detailingStore.readiness.ready && !generating && !busy` | `detailing-prerequisites` lists the blocking members **with counts and ids**, and the same text is the button's `title` | `model.detailing.assemblies` | `detailing-count`, `documents` |
| Diseñar pisos | `floor-design-run` | `readiness.ready && !generating` | `floor-design-prereqs` | adds `FLOOR-*` assemblies | `floor-families` |
| Ver modelo 3D (barra) | `cmd-open-3d` | `canOpenRebar3D()` — i.e. **≥1 assembly** | `title` = "openBlocked"; the count chip `cmd-open-3d-count` disappears | nothing in the model — view only | the overlay |
| Ver modelo 3D (disclosure) | `doc-3d` | always rendered; refuses with `doc-error`/`cmd-open-3d-error` | — | nothing | the overlay |
| Cancelar | `cmd-cancel` | only while `busy` | absent otherwise | aborts the run | `summary-aborted` |

**Both 3-D buttons call `openRebar3D`**, which rebuilds the document from the persisted
assemblies on every open. That is what keeps the cage, the schedule, the report and the drawings
projections of one instance. `canOpenRebar3D()` reads the persisted assemblies, not a built
document, so the enabled state costs nothing to compute.

### Coverage — pipeline

| Control | e2e | Gap / risk |
|---|---|---|
| `cmd-compute-demands` | `rc-cad-production-download`, `single-regulation-source` | the DISABLED state (no results) is never asserted — PENDIENTE |
| `cmd-code-check` | `rc-cad-production-download`, `regulations`, `single-regulation-source` | idem |
| `cmd-autodesign` / `-menu` / `-undesigned` | `rc-design` | the menu's `aria-expanded` is set but never asserted — PENDIENTE |
| `cmd-design-all` | `pro-workflow-shell`, `rc-cad-production-download`, `rc-design` | — |
| `cmd-design-families` | `design-families` | — |
| `cmd-generate-detailing` | 13 specs | `detailing-prerequisites` was referenced by nothing; **closed** by `pro-design-gates.spec.ts`, which asserts the visible sentence and the tooltip are the same sentence |
| `floor-design-run` | 11 specs | `floor-design-prereqs`, `floor-design-error` — PENDIENTE |
| `cmd-open-3d` | `pro-workflow-shell`, `prepared-building`, `pro-design-gates` | the disabled state and its stated reason are **closed**; `cmd-open-3d-error` — PENDIENTE |
| `doc-3d` | 9 specs | — |
| `cmd-cancel` | — | **PENDIENTE**: no spec cancels a run |
| `concrete-code-gate`, `goto-project-regulations` | `single-regulation-source` (gate only) | the LINK is never clicked — PENDIENTE |

**Accessibility.** Every command is a real `<button>` with visible text; disabled ones carry a
`title` with the reason, which a screen reader announces but a keyboard-only user cannot summon
without hovering — the same reason is in `detailing-prerequisites` as visible text, so the fact is
not colour- or hover-only. `cmd-autodesign-menu` declares `aria-haspopup="menu"` and
`aria-expanded`, and the menu has `role="menu"`/`role="menuitem"`; **it has no arrow-key
navigation and no Escape-to-close** — PENDIENTE, and the one genuine keyboard defect in this row.

---

## 2. Counts and banners — the state of the run

Everything here is a read-out; none of it is clickable except the banner buttons.

| Read-out | id | Appears when | Says |
|---|---|---|---|
| total / verificados / advertencia / no verifica | `summary-count-total`, `-verified`, `-warn`, `-fail` | always | glyph + number + word |
| provisional | `summary-count-provisional` | always, including at zero | `◐` — deliberately **not** folded into `fail` |
| sin datos / desactualizado | `summary-count-unavailable`, `-stale` | always | `○`, `⌛` |
| sección insuficiente / búsqueda agotada / no soportado | `summary-count-section-inadequate`, `-exhausted`, `-unsupported` | only when > 0 | run-outcome chips |
| abortado / truncado | `summary-aborted`, `summary-not-reached` | after an aborted or truncated run | |
| progreso | `design-progress` | while `busy` | `role="status"`, `aria-live="polite"` |

| Banner | id | Trigger | Buttons |
|---|---|---|---|
| sin combinaciones | `banner-no-combinations` | `!hasCombinations` | — (`role="alert"`) |
| orientación sospechosa | `banner-orientation` | `orientationSuspectCount > 0` | `banner-orientation-detail` |
| línea base desactualizada | `banner-stale` | `isBaselineStale` | `banner-rerun-code-check` |
| ediciones manuales | `banner-changed` | `editedCount > 0` | `banner-review-changes`, `banner-revert-edits` |
| propuestas provisionales | `banner-provisional` | `provisionalIds.size > 0` | `banner-provisional-review` |
| error de la corrida | `banner-error` | `designRunStore.lastError` | — (`role="alert"`) |
| diagnóstico del modelo | `design-diagnostics-warning` | `diagnosticsWarning.visible` | opens the Diagnostics tab |

### Coverage — counts and banners

`summary-count-verified/warn/fail/provisional/unavailable/unsupported/exhausted` are asserted in
`rc-design.spec.ts`. **PENDIENTE:** `summary-count-total`, `summary-count-stale`,
`summary-count-section-inadequate`, `summary-aborted`, `summary-not-reached`, `design-progress`,
and **every banner except `banner-orientation`** — six banners and their five buttons are
referenced by nothing. The revert path in particular (`banner-revert-edits` → `revertAllEdits`)
mutates the model and has no browser coverage at all; that is the highest-value gap in this
section.

**Accessibility.** Blocking banners are `role="alert"`, informational ones `role="status"`. Each
count carries a glyph **and** a word, so none of them is colour-only — the invariant §5.2 of the
plan document asks for. `OutcomeBadge` renders glyph + text + `sr-only` text.

---

## 3. Table, filters, grouping and selection

| Control | id | Action | Writes | Shows on |
|---|---|---|---|---|
| chips de estado | `filter-${f}` | filter rows; `aria-pressed` | local view state | table + chip counts |
| búsqueda | `design-search` | text filter | local | table |
| orden | `sort-${s}` | sort key, direction glyph ▲▼ | local | table header |
| agrupar por nivel / plano / línea de pórtico | `group-picker-elevation`, `-plane`, `-frameline` | select members | `batchSelection` | `selection-count` |
| agrupar por sección / atributo | `group-picker-section`, `-attr` | idem (`-section` is `hidden`, driven programmatically) | idem | idem |
| refusals | `group-elevation-refused`, `group-plane-refused`, `group-frameline-refused` | — | — | states WHY a grouping is not offered |
| nota de agrupación | `group-note` | — | — | ambiguous frame lines / splits |
| seleccionar todo | `select-all` | check every visible row | `batchSelection` | `selection-count` |
| fila | `row-checkbox-${id}`, `row-expand-${id}` | select / expand inline verification | `expandedId` | detail block |
| edición masiva | `batch-open` → `batch-dialog` | opens the dialog | — | dialog |
| siguiente que falla | `next-failing` | moves focus to the next failing row | `focusedId` | table |
| cambios | `review-changes` | opens `changed-members-panel` | — | panel |
| diseñar / limpiar una fila | `design-one-${id}`, `clear-rebar-${id}` | design or clear ONE member | `element.reinforcement` | row, counts |

### Coverage — table and filters

Covered by `rc-design.spec.ts`: `filter-${f}`, `sort-${s}`, `design-search`, `design-table`,
`design-table-empty`, `select-all`, `row-checkbox-*`, `row-expand-*`, `row-status-*`,
`next-failing`, `group-picker-elevation`, `group-elevation-refused`.

**PENDIENTE:** `group-picker-plane`, `group-picker-frameline`, `group-picker-section`,
`group-picker-attr`, `group-plane-refused`, `group-frameline-refused`, `group-note`,
the whole `changed-members-panel` (`revert-all`, `revert-${id}`, `changed-close`),
`design-one-${id}`, `clear-rebar-${id}`, `row-util-*`, `row-flags-*`, `row-elevation-*`.

**Risk worth naming:** three of the five grouping pickers and both of the per-row design actions
are untested, and all five write selection or model state.

`design-placeholder-solve` and `design-placeholder-demands` — the two EMPTY STATES of the whole
tab, where "the table is missing" and "the table says why it is missing" were indistinguishable to
the suite — are **closed** by `pro-design-gates.spec.ts`, which asserts that each appears in its
own condition, that they are different sentences, and that the command the second one asks for is
the one command available.

**Accessibility.** Chips use `aria-pressed`; the search input has an `aria-label`; the group
pickers have `aria-label`s. The table is navigable with `j`/`k`/`↵`/`space` and says so in a
visible hint. `group-picker-section` is `hidden` and driven from code — it is not a keyboard
target and is not meant to be.

---

## 4. Families (Diseño → Diseño for the whole building)

| Control | id | Enabled when | Writes | Shows on |
|---|---|---|---|---|
| casilla por familia | `design-family-${f}` | always | local selection | `design-family-summary` |
| todas / ninguna | `design-family-all`, `design-family-none` | always | idem | idem |
| ejecutar | `cmd-design-families` | `canDesign && selection.length > 0 && !running` | frame + floor design | `design-family-result` |
| resultado por familia | `design-result-${family}` | after a run | — | state + counts per family |
| totales | `design-family-totals` | after a run | — | processed / designed / refused / not modelled |
| ver en 3D | `design-result-view-3d` | ≥1 assembly in the model **or** in the built document | opens the workspace | overlay |

All of these are exercised by `design-families.spec.ts`. The footing note
(`design.families.footingNote`) is rendered where the boxes are, so leaving foundations out is a
visible choice rather than a silent default — **PENDIENTE:** no spec asserts that note.

---

## 5. Detailing disclosure

| Control | id | Notes |
|---|---|---|
| disclosure | `detailing-disclosure` | `<details>`; keyboard-operable summary with `:focus-visible` |
| contador | `detailing-count` | assemblies in the model |
| vacío + generar | `detailing-empty`, `detailing-empty-generate`, `detailing-empty-prereqs` | the empty state carries its own generate button and its own prerequisites |
| auto tras diseñar | `detailing-auto` (+ `detailing-auto-label`) | checkbox → `detailingStore.setAutoGenerate` |
| lista de ensambles | `assembly-${id}`, `assembly-state`, `assembly-maturity`, `assembly-superseded` | selection drives the schedule below |
| barras | `bar-list`, `bar-${id}`, `bar-lock` | `bar-lock` toggles a manual lock |
| conflictos | `conflict-counter`, `conflict-nav`, `conflict-prev`, `conflict-next`, `conflict-detail`, `no-conflicts` | |
| planilla | `schedule`, `schedule-mass`, `schedule-purpose`, `aggregate-crossref` | the `Función` column distinguishes resistant steel from constructive steel |
| láminas | `sheet-kind-elevation`, `sheet-kind-section`, `sheet-preview` | |
| documento | `doc-readiness`, `doc-revision`, `doc-maturity`, `doc-conflicts`, `doc-none`, `doc-error` | |
| exports | `doc-report`, `doc-dxf`, `doc-xlsx`, `doc-3d` | three downloads and the viewer, from one document instance |
| superadas | `superseded-docs`, `superseded-${n}` | |
| revisión | `review-engineer`, `review-notes`, `review-submit`, `review-record`, `review-disclaimer`, `review-error`, `ack-${key}` | `review-submit` is disabled below `REVIEWED` rank |
| errores | `detailing-error` | |

### Coverage — detailing

Well covered by `detailing.spec.ts`, `documents.spec.ts` and `floor-families-document.spec.ts`:
the assemblies, the bar list, the lock, the conflict navigation (`conflict-next` only), the
schedule, the three exports, the superseded list and the review flow.

**PENDIENTE:** `conflict-prev` (only `-next` is driven), `assembly-superseded`, `doc-maturity`,
`doc-conflicts`, `doc-error`, `detailing-error`, `detailing-prerequisites`, `detailing-workflow`,
`detailing-auto-label`, `sheet-preview` sizing.

---

## 6. Floors, foundations and the CAD handoff

`floor-families-disclosure` → `FloorFamiliesPanel`, with `floor-design-run`,
`floor-family-${key}`, `floor-slabs-table` / `floor-slabs-empty`, `floor-walls-table` /
`floor-walls-empty`, `floor-unsupported`, `floor-foundations-summary`,
`floor-footings-not-verified`, `floor-footing-assumptions`, `floor-design-code`.

`FoundationsPanel` owns the footing editor (`footing-B`, `-L`, `-thickness`, `-cover`,
`-elevation`, `-rotation`, `-ecc-b`, `-ecc-l`, `-column`, `-soil`, the pedestal group and
`footing-delete`), the soil profiles (`soil-add`, `soil-${id}-*`) and the mat preferences
(`footing-mat-dia-x`, `-dia-y`, `-layer-order`, `-spacing-policy`).

Covered by `foundations.spec.ts`, `floor-families-document.spec.ts`, `rc-cad-handoff.spec.ts` and
`rc-cad-production-download.spec.ts`.

**PENDIENTE, and these are edits to the model:** `footing-name`, `footing-rotation`,
`footing-ecc-b`, `footing-ecc-l`, `footing-delete`, the whole pedestal group
(`footing-pedestal-on/-b/-l/-h`), `footing-count`, `footing-no-supports`,
`footing-mat-total-bars`, `footing-mat-findings`, `footing-mat-conflicts`,
`footing-mat-no-conflicts`, `footing-mat-not-designed`, `footing-mat-not-modeled`,
`footing-mat-physical-none`, `footing-mat-punching-d`, `footing-mat-punching-moment`,
`footing-mat-layer-order-block`, `footing-mat-anchorage-failures`, `footing-cad-export-details`,
`footing-cad-tool-unavailable`, `floor-footing-count`, `floor-design-prereqs`,
`floor-design-error`.

`footing-delete` deleting a footing with no confirmation and no test is the single riskiest
untested control on this surface.

---

## 7. The 3-D workspace

### 7.1 Opening and closing

| | |
|---|---|
| from the command row | `cmd-open-3d` — enabled on ≥1 assembly, shows the count |
| from the disclosure | `doc-3d` — inside `detailing-disclosure` |
| from the families result | `design-result-view-3d` |
| from the scene panel | `rebar-open-workspace` |
| close | `rebar-workspace-close`, **Escape**, and nothing else |

The overlay is `role="dialog" aria-modal="true"`, `position: fixed`, `z-index: 900`. Since PR20 it
captures focus on open, cycles Tab/Shift+Tab inside itself (`lib/utils/dialog-focus.ts`) and
restores focus to the opener on close — the defect §5.2 of the plan lists first.

### 7.2 Rail

| Control | id | Writes | Shows on |
|---|---|---|---|
| familia | `rebar-layer-${kind}` (6) | `hiddenKinds` | scene meshes + `rebar-tally` |
| familia vacía | `rebar-layer-empty-${kind}` | — | says the model has none |
| armaduras / hormigón / conflictos | `rebar-layer-bars`, `-concrete`, `-conflicts` | `showBars`, `showConcrete`, `showConflicts` | scene |
| ocultar sin armar | `rebar-hide-unreinforced` | `hideUnreinforced` | scene |
| exageración | `rebar-exaggerate` | `diameterScale` | **rebuilds** the tubes — the one control that must |
| opacidad | `rebar-opacity` | `concreteOpacity` | scene, without touching selection |
| corte | `rebar-section-axis`, `rebar-section-at` | `section` | scene |
| tally | `rebar-tally`, `rebar-tally-${family}` | — | solids / longitudinals / transverse per family |
| piezas | `rebar-pieces`, `rebar-piece-${kind}` | — | hoops apart from crossties |
| familias vacías | `rebar-empty-families` | — | |
| estados | `rebar-status-panel`, `rebar-status-counts`, `rebar-status-${s}`, `rebar-status-cause-${s}` | `statusFilter` | member list |
| acero superior constructivo | `rebar-status-hanger-top`, `rebar-element-hanger-${id}` | — | a chip that is **orthogonal to the seven states** and must not be merged into the badge |
| lista de miembros | `rebar-element-list`, `rebar-element-${id}` | selection + camera | inspector |

### 7.3 Header, inspector and banners

`rebar-workspace-readiness`, `rebar-workspace-summary`, `rebar-back`, `rebar-fit-view`,
`rebar-rail-toggle` (`aria-expanded`), `rebar-workspace-building`, `rebar-workspace-empty`,
`rebar-provisional-banner`, `rebar-torsion-banner`, `rebar-inspector` (+ `rebar-sel-mark`,
`-piece`, `-parent`, `-status`, `-reason`, `-torsion`), `rebar-isolate` /
`rebar-clear-isolation`, and the conflict inspector (`rebar-conflict-*`).

### Coverage — workspace

Strong: `rebar-3d.spec.ts` (size, layers, selection, states, tally, DXF), `rebar-toggles.spec.ts`
(every switch asserted against `rebarSceneCensus()`, i.e. against the meshes rather than the
tally), `rebar-viewport-cost.spec.ts` (no rebuild, no leaked context), `rebar-workspace-open.spec.ts`
(open cost by phase), `rebar-workspace-focus.spec.ts` (focus trap, restore, rail at width).

**PENDIENTE:**
- the **whole conflict inspector** — `rebar-conflict-inspector`, `-severity`, `-class`, `-bar-a`,
  `-bar-b`, `-measured`, `-required`, `-shortfall`, `-parent`, `-assembly`, `-warning`,
  `-centre`, `-isolate`, `-clear-isolation`. Nothing references any of them. It is reached by
  clicking a marker in the canvas, which is pointer-only — the plan document's accessibility
  item 2 — so it is both the least tested and the least reachable part of the viewer;
- `rebar-hide-unreinforced` (a filter axis with no test);
- `rebar-workspace-readiness`, `rebar-workspace-empty`, `rebar-summary`, `rebar-scope`,
  `rebar-scene`, `rebar-unresolved`, `rebar-panel-states`, `rebar-sel-mark`, `rebar-sel-piece`,
  `rebar-sel-torsion`, `rebar-status-hanger-top`, `rebar-element-hanger-${id}`.

**Accessibility.** The layer switches are real checkboxes with real labels — the part that usually
goes wrong and here does not. Empty families are stated in words on the switch itself. The rail is
still a bare `<aside>` with no accessible name (plan §5.2 item 3) — PENDIENTE. The canvas has no
text alternative and no keyboard route to the things that exist only in the picture, chiefly the
conflict markers (item 2) — PENDIENTE, and the conflict list in the detailing panel is the cheap
honest fix the plan already proposes.

---

## 8. Regulations, project files, autosave and restore

| Control | id | Notes |
|---|---|---|
| disclosure | `code-settings-disclosure` (+ `code-settings-attention`) | the badge appears on a pending change or a stack problem |
| jurisdicción / adopción | `regs-jurisdiction`, `regs-adoption` | **PENDIENTE** both |
| rol → edición | `role-select-${role}` | the ONE selector; the command bar's `active-concrete-code` is a read-out of it |
| cambio pendiente | `pending-load-change`, `pending-review-in-loads`, `pending-cancel` | `regulations.spec.ts` |
| ediciones no disponibles | `unavailable-editions`, `unavailable-${id}` | `regulations.spec.ts` |
| materiales | `regs-edit-materials` | `regulations.spec.ts` |
| abrir / guardar proyecto | `pr-project` → `pp-open` / `pp-open-file`; `pr-save` and `pp-save` | `pro-project-files.spec.ts`, retargeted at the ribbon — open, save, round trip, "opening is not a silent solve" |
| `.ded` round trip, small and 7-storey | the same controls | `ded-roundtrip.spec.ts` — save, reopen on a page that has never seen the project, and compare the model, the detailing and the drawn scene |
| oferta de autoguardado | `autosave-prompt` (in `App.svelte`), `autosave-older-warning` | `project-restore.spec.ts` |
| autor del detallado | `detailingAuthor` — resolved when the 3-D command builds the document | **PENDIENTE: no test id and no spec.** The author reaches the sheets and the report; today nothing asserts which name arrives there |

**Autosave.** IndexedDB, revisions with a structural fingerprint, an unfinished-write marker and a
reported-not-silent localStorage fallback. `requestAutosave` is asked for after every expensive
operation — solve, design, floor design, detailing — not only by the 30 s timer.
`project-restore.spec.ts` is the journey that proves the stored project contains the design, that
the restore hands it back, and that nothing falls back silently.

**Measured while writing this document** (7-storey `pro-edificio-7p`, full chain): the autosave
writes in ~2 s to IndexedDB and stores 203 reinforced members. See §10 — the `.ded` save of the
same project does **not** behave the same way, and that is a finding, not a test-harness detail.

---

## 9. Layout and the 1280×720 case

`.rc-workflow` scrolls (`overflow-y: auto`, `min-height: 0` on the last child). It used to be
`overflow: hidden`, and with three disclosures open at 1280×720 the *Generar detallado* button
reported a box at y = 874 with `document.elementFromPoint` returning `null` at its centre: an
enabled command outside the viewport, where a real pointer event lands on nothing while a
programmatic `.click()` still works. The disclosures cap at 55vh / 70vh for the same reason.

**Closed in this pass.** `e2e/pro-design-gates.spec.ts` opens all three disclosures at 1280×720
on a designed model and asserts that every ENABLED command is hit-testable at its own centre —
`document.elementFromPoint` at the middle of the button returns the button. It reached
`cmd-compute-demands`, `cmd-code-check`, `cmd-design-all`, `cmd-generate-detailing`,
`cmd-open-3d`, `cmd-design-families`, `next-failing` and `review-changes`, and it prints that
list, so a version of it that silently checked nothing would be visible.

**Observed while writing that test, and left as an observation:** at 1280×720 the toasts raised
by the solve and by the design land squarely on the command row — the first run failed on
`cmd-design-all` with a "3D analysis successful" notice over it. They auto-dismiss, so this is a
few seconds of a covered button rather than an unreachable one, and it is a different question
from the one the test guards; the test waits them out. Whether a transient notice should be
allowed to cover the primary commands at the smallest supported width is a design call, not a
defect to patch here.

---

## 10. Findings that are not test gaps

1. ~~**`pro-project-save` does not survive the fully-detailed 7-storey project.**~~
   **RETRACTED — the measurement was wrong, and this is what it actually was.**

   The original claim was that the real Save button produced no download in 180 s and the browser
   context died. What was actually clicked was `pro-project-save`, a control PR20 had already
   removed from desktop PRO — the same missing-locator cause as §10.5 — so Playwright waited on a
   button that does not exist while the download timeout it was racing fired first and got the
   blame. `context.storageState({ indexedDB: true })` not returning is a real limit of that
   Playwright API on a payload this size, and says nothing about the app.

   Driven through the control that DOES exist (`pr-save`), the same project saves in **2 s** with
   the 3-D scene never built and **3 s** immediately after building and closing it. Nothing was
   broken.

   What the measurement did find is worth having, and is fixed:

   | | before | after |
   |---|---|---|
   | 7-storey `.ded` | 110 341 310 B (110,3 MB) | **47 989 693 B (48,0 MB)** |
   | `JSON.stringify` of the payload | 202 ms | 56 ms |
   | small committed fixture | 11 778 B | 5 367 B |

   `serializeProject` was pretty-printing with `null, 2`. On a document that is mostly nested
   arrays of coordinates, that spent about twenty bytes of indentation per six-byte number:
   sixty-two of the hundred-and-ten megabytes were whitespace. Whitespace is not part of the
   format — both sides go through `JSON.parse` — so dropping it needs no migration and every
   existing `.ded`, including the pretty-printed committed fixture, still opens.

2. **`cmd-cancel` has no coverage**, and it is the only way out of a long design run.
3. **`footing-delete` has no coverage and no confirmation.**
4. **The conflict inspector is unreachable by keyboard and untested.**
5. ~~**Fourteen e2e tests are red for one reason.**~~ **FIXED.**

   `pro-project-files.spec.ts` (4), `rc-cad-handoff.spec.ts` (8) and
   `rc-cad-production-download.spec.ts` (2) were all reaching for controls PR20's ribbon replaced.
   The product was never broken; the tests were describing the previous shell. The equivalences,
   for anyone reading an older spec:

   | PR19 | PR20 |
   |---|---|
   | `pro-project-open` (PRO desktop bar) | `pr-project` → the panel's `pp-open` |
   | `pro-project-save` | `pr-save` on the ribbon, `pp-save` in the panel — both `saveProject` |
   | `project-open-file` on PRO desktop | `pp-open-file` in the ribbon's Project view |
   | Básico's `project-open-file`, always mounted | same input, inside the panel `hdr-project` opens |
   | `ANALYSIS` menu → `Design` | `pr-stage-design` → `pr-cmd-design` |
   | toolbar `Solve` | `pr-stage-analyse` → `pr-cmd-solve` |

   The ribbon's file input needed a test id and now has `pp-open-file` rather than a third copy of
   `project-open-file`: `ProPanel` renders the mobile action row and the active tab as siblings,
   so on a phone with the Project tab open it is the one input that CAN be mounted beside another.

6. **A restored project stopped saying which of its members are proposals. FIXED.**

   Found by the file round trip this pass added. `migrateDetailingStore` rebuilds every assembly
   from an explicit allow-list, and `provisionalMembers` and `torsionUnevaluatedMembers` were not
   on it — while `bars` is carried through whole. So after any restore (`.ded`, autosave, undo,
   tab switch) the bars kept `provisional = 'biaxial'` and their violet, and the assembly stopped
   carrying the member-level fact that the workspace banner, the sheet note and the report section
   all read. The picture said "proposal" and the words said nothing.

   That is the exact disagreement `run-detailing` records the field to prevent. Both fields are
   now carried through when present and left absent when not — never recomputed, because they are
   stamped from design outcomes that a snapshot does not contain, and deriving them from a
   restored project would be inventing a verdict rather than remembering one.

## Typecheck baseline

`npm run typecheck` reports **479 errors against a baseline of 490** and passes: no new type
errors. The eleven that are no longer reported are baseline DEBT, not a regression — the baseline
was recorded before this branch and nothing in this pass touched them. It is deliberately not
re-recorded here: lowering it is a separate change whose diff should be reviewed on its own, and
doing it inside a test pass would hide which errors went away and why.

## 11. What this document does not cover

The Loads tab's auto-loads dialog (`al-*`, 20 untested ids), Diagnostics, Results, Shell,
Connections and Constraints. They are PRO surfaces but not `Diseño → Diseño`, and mixing them in
would make the coverage numbers above mean something else.
