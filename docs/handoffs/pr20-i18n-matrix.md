# PR20 — three languages, audited surface by surface

**Policy.** The picker offers **English, Español, Português** and nothing else. Detection reads
the browser and narrows to that list; anything else opens in English. Ported by hand from
`be1c63b4` on `audit/basic-advanced-features` (PR #132) — see §1.

**What the audit found.** The policy was the easy half. Making it TRUE cost 894 keys.

| | |
|---|---|
| PRO-flow keys missing from `pt` (static) | **721** |
| enumerated state/family names missing from `pt` (built by template literal) | **111** |
| engine-message keys missing from `pt` | **62** |
| duplicate declarations removed from `pt` | 5 |
| strings hard-coded in components, now keyed | 20 |
| placeholder mismatches fixed | 1 |
| **keys added or corrected** | **894** |

Every one of those rendered ENGLISH to a Portuguese reader, silently, because `tAt()` falls back
to English per key. Under a picker that listed fourteen languages that was merely untidy. Under a
picker that offers three, it is a promise the app was not keeping.

---

## 1. Where the policy came from, and what was NOT taken

| | |
|---|---|
| Branch | `origin/audit/basic-advanced-features` (PR **#132**) |
| Commit | **`be1c63b4`** — "i18n: translate this PR into pt, move code lore out of the data layer, narrow the offered languages" |
| Cherry-pickable? | **No.** Trial pick conflicts in 5 files and auto-merges a sixth |

Conflicting files on a trial `git cherry-pick -n be1c63b4`:

```
CONFLICT (modify/delete) web/src/lib/data/code-lore.ts     deleted in HEAD
CONFLICT (content)       web/src/App.svelte
CONFLICT (content)       web/src/lib/i18n/locales/en.ts
CONFLICT (content)       web/src/lib/i18n/locales/es.ts
CONFLICT (content)       web/src/lib/i18n/locales/pt.ts
Auto-merging             web/src/components/ribbon/Ribbon.svelte
```

That last one is why a clean pick would still have been wrong: `components/ribbon/Ribbon.svelte`
is **Básico's** ribbon, and the commit changes its data-tab behaviour. Basic/Education is out of
bounds for this pass, and `code-lore.ts` is a Basic data refactor that PR20's base has already
deleted.

**Ported by hand, and only this:**

- `lib/i18n/store.svelte.ts` — `OFFERED_LOCALES`, `isOfferedLocale`, detection narrowed to the
  offered list, and a stored-but-no-longer-offered locale falling through to detection. This file
  is **not shared** with PR20's diff, so it took the change cleanly.
- `App.svelte` — the picker now loops `OFFERED_LOCALES` instead of listing fourteen `<option>`s.

**One deliberate difference from #132:** `setLocale` REFUSES a code that is not offered instead of
storing it. The picker's value is bound to `i18n.locale`, and a `<select>` whose value matches no
option renders blank — accepting `de` would leave the control showing nothing, in a language
nobody chose, and persist that across reloads. #132 narrowed detection and the picker but left
this entry point open. Flagged here so the two branches can converge on it deliberately.

**Not taken:** the Basic ribbon change, the `code-lore.ts` refactor, and #132's own locale
content. Nothing from another worktree is mixed in.

---

## 2. The matrix

Legend — **✅** the key exists in all three and the rendered text is asserted by a test;
**◑** exists in all three, covered only by the key-parity gate; **PEND** debt, named in §5.

### A. Navigation and PRO shell

| Control / message | Key | EN | ES | PT | Fallback | Test | Result |
|---|---|---|---|---|---|---|---|
| language picker | `lang.es` / `lang.en` / `lang.pt` | English | Español | Português | — | `i18n-languages` + `offered-locales` | ✅ |
| picker accessible name | `app.language` | Language | Idioma | Idioma | en | `pro-flow-coverage` | ◑ (key added this pass) |
| ribbon stage — Design | `proRibbon.stageDesign` | Design | Diseño | Dimensionamento | en | `i18n-languages` | ✅ |
| ribbon groups | `proRibbon.group*` (9) | ✓ | ✓ | ✓ | en | parity gate | ◑ |
| Project view — Open | `project.open` | Open | Abrir | Abrir | en | `i18n-languages` | ✅ |
| Project view — Save | `project.saveTab` | Save Tab | Guardar Pestaña | Salvar Aba | en | `i18n-languages` | ✅ |
| Project view — autosave | `proProject.autosaveSection` | Autosave | Guardado automático | Salvamento automático | en | `i18n-languages` | ✅ |
| autosave backend | `proProject.backend.*` (3) | ✓ | ✓ | ✓ | en | parity gate | ◑ |
| Settings / regulations | `regulations.title` | Project regulations | Reglamentos del proyecto | Normas do projeto | en | `i18n-languages` | ✅ |
| regulation roles | `regulations.role.*` (8) | ✓ | ✓ | ✓ | en | parity gate | ◑ |
| regulation states | `regulations.state.*` (4) | ✓ | ✓ | ✓ | en | parity gate | ◑ |
| review author | `detailing.engineer`, `detailing.recordReview` | ✓ | ✓ | ✓ | en | parity gate | ◑ |
| Diagnostics | `pro.diagKind*` (3) | ✓ | ✓ | ✓ | en | parity gate | ◑ |
| disabled command reason | `detailing.scene.openBlocked` | ✓ | ✓ | ✓ | en | `i18n-languages` (title asserted) | ✅ |
| empty state — no results | `design.error.solveFirst` | ✓ | ✓ | ✓ | en | `i18n-languages` | ✅ |
| empty state — no demands | `design.table.needDemands` | ✓ | ✓ | ✓ | en | `pro-design-gates` | ◑ |
| focus trap / Escape | — | non-textual | | | | `rebar-workspace-focus` | ✅ |

### B. Diseño → Diseño para hormigón

| Control / message | Key | EN | ES | PT | Test | Result |
|---|---|---|---|---|---|---|
| Calcular solicitaciones | `design.cmd.computeDemands` | Compute demands | Calcular solicitaciones | Calcular solicitações | `i18n-languages` | ✅ |
| Verificar | `design.cmd.codeCheck` | Run code check | Verificar según norma | Executar verificação normativa | `i18n-languages` | ✅ |
| Diseñar todo | `design.cmd.designAll` | Design all | Diseñar todo | Dimensionar tudo | `i18n-languages` | ✅ |
| selector de familias | `design.families.*` (18) | ✓ | ✓ | ✓ | `design-families` + parity | ◑ |
| ejecutar familias | `design.families.running` | ✓ | ✓ | ✓ | parity gate | ◑ |
| Diseñar pisos | `detailing.floorRun.designAndDetail` | Design and detail floors | Dimensionar y despiezar pisos | Dimensionar e detalhar pavimentos | `i18n-languages` | ✅ |
| Generar detallado | `detailing.cmd.generate` / `.regenerate` | ✓ | ✓ | ✓ | `i18n-languages` | ✅ |
| Cancelar | `design.cmd.cancel` | Cancel | Cancelar | Cancelar | parity gate | ◑ |
| progreso | `design.cmd.progress` | `{done} / {total} members…` | `…barras…` | `…elementos…` | parity gate | ◑ |
| estados por familia | `design.families.state.*` (4) | ✓ | ✓ | ✓ | parity gate | ◑ |
| VERIFIED | `detailing.state.VERIFIED` | Verified | Verificado | Verificado | `pro-flow-coverage` | ◑ |
| PROVISIONAL | `detailing.scene.status.PROVISIONAL` | Provisional proposal | Propuesta provisional | Proposta provisória | `i18n-languages` (viewer) | ✅ |
| FAILED | `detailing.scene.status.FAILED` | Failed | Falla | Falha | `pro-flow-coverage` | ◑ |
| UNSUPPORTED | `detailing.scene.status.UNSUPPORTED` | Unsupported | No soportado | Não suportado | `pro-flow-coverage` | ◑ |
| mensajes de motivo | `design.reason.*` | ✓ | ✓ | ✓ | `locale-parity` (all 14) | ✅ |
| conflictos | `detailing.pairClass.*` (6), `detailing.scene.conflict.*` | ✓ | ✓ | ✓ | parity gate | ◑ |
| torsión | `detailing.scene.torsionBanner` / `.torsionLabel` | ✓ | ✓ | ✓ | parity gate | ◑ |
| biaxial (provisional) | `detailing.scene.provisionalBanner` | ✓ | ✓ | ✓ | parity gate | ◑ |
| tabla vacía | `design.table.empty` | ✓ | ✓ | ✓ | parity gate | ◑ |
| restauración tras diseño | `file.autosave*` (7) | ✓ | ✓ | ✓ | parity gate | ◑ |

### C. 3-D viewer

| Control / message | Key | EN | ES | PT | Test | Result |
|---|---|---|---|---|---|---|
| open from the command row | `detailing.scene.openMain` | View 3-D model | Ver modelo 3D | Ver modelo 3D | `i18n-languages` | ✅ |
| open from the disclosure | `detailing.scene.open` | View in 3-D | Ver en 3D | Ver em 3D | parity gate | ◑ |
| columns | `detailing.scene.kind.column` | Columns | Columnas | **Pilares** | `i18n-languages` (tally) | ✅ |
| beams | `.kind.beam` | Beams | Vigas | Vigas | `i18n-languages` (tally) | ✅ |
| slabs | `.kind.slab` | Slabs | Losas | **Lajes** | `pro-flow-coverage` | ◑ |
| walls | `.kind.wall` | Walls | Tabiques | **Paredes estruturais** | `pro-flow-coverage` | ◑ |
| foundations | `.kind.footing` | Foundations | Fundaciones | Fundações | `pro-flow-coverage` | ◑ |
| pedestals | `.kind.pedestal` | Footing pedestals | Dados de fundación | **Pedestais de fundação** | `pro-flow-coverage` | ◑ |
| reinforcement | `detailing.scene.showBars` | Reinforcement | Armaduras | Armaduras | `i18n-languages` | ✅ |
| concrete | `.showConcrete` | Concrete | Hormigón | **Concreto** | `i18n-languages` | ✅ |
| conflicts | `.showConflicts` | Conflicts | Conflictos | Conflitos | `i18n-languages` | ✅ |
| opacity | `.opacity` | Concrete opacity | Opacidad del hormigón | Opacidade do concreto | parity gate | ◑ |
| section | `.section`, `.sectionFlip`, `.sectionOff` | ✓ | ✓ | ✓ | parity gate | ◑ |
| selection / inspector | `.selectedElement`, `.noSelection`, `.parentElement` | ✓ | ✓ | ✓ | parity gate | ◑ |
| isolate | `.isolate` / `.clearIsolation` | ✓ | ✓ | ✓ | parity gate | ◑ |
| piece kinds | `.piece.*` (6) | ✓ | ✓ | ✓ | `pro-flow-coverage` | ◑ |
| tally | `.tally.title` + `.tally.*` | ✓ | ✓ | ✓ | `i18n-languages` | ✅ |
| building message | `.building` | Building the cage — {bars} bars… | Construyendo la armadura… | Construindo a armadura… | parity gate | ◑ |
| fit view / close | `.reset` / `.workspace.close` | ✓ | ✓ | ✓ | `i18n-languages` | ✅ |
| 1280×720 | — | non-textual | | | `pro-design-gates` | ✅ |

### D. Documents and exports

| Control / message | Key | EN | ES | PT | Test | Result |
|---|---|---|---|---|---|---|
| Informe / PDF | `detailing.doc.report` | Report / PDF | Informe / PDF | Relatório / PDF | `i18n-languages` | ✅ |
| Planos / DXF | `detailing.doc.dxf` | Drawings / DXF | Planos / DXF | Desenhos / DXF | `i18n-languages` | ✅ |
| Planilla / XLSX | `detailing.doc.xlsx` | Bar schedule / XLSX | Planilla de doblado / XLSX | Planilha de dobragem / XLSX | `i18n-languages` | ✅ |
| bar function column | `detailing.schedule.purpose.*` (2) | ✓ | ✓ | ✓ | `pro-flow-coverage` | ◑ |
| bar roles | `detailing.barRole.*` (2) | ✓ | ✓ | ✓ | `pro-flow-coverage` | ◑ |
| provisional sheet note | `maturity.provisionalDrawingNote` | ✓ | ✓ | ✓ | `engine-purity` (now incl. pt) | ◑ |
| document readiness | `detailing.doc.readiness.*` (5) | ✓ | ✓ | ✓ | `pro-flow-coverage` | ◑ |
| save / restore messages | `file.autosave*` (7), `file.loadedNoAxisConvention` | ✓ | ✓ | ✓ | parity gate | ◑ |
| `.ded` round trip in 3 languages | — | | | | `i18n-languages` (save + reopen per language) | ✅ |
| load derivations, CIRSOC refusals | `loadPlan.*`, `loads.cirsoc*`, `codes.*` (62 keys) | ✓ | ✓ | ✓ | `engine-purity` | ✅ |

---

## 3. Tests added

**Unit — `lib/i18n/__tests__/offered-locales.test.ts` (33)**
the offered list; each of `en`/`es`/`pt` detected; `en-US`, `en-GB`, `es-AR`, `es-419`, `pt-BR`,
`pt-PT`; eleven unsupported languages falling back to English; first-OFFERED-wins across a
preference list; empty `navigator`; detection persisted without claiming to be a choice; a manual
choice persisted and honoured across a reload; a hot switch; a stored-but-unoffered locale
ignored; `setLocale` refusing an unoffered code.

**Unit — `lib/i18n/__tests__/pro-flow-coverage.test.ts` (13)**
harvests every key the PRO surfaces use — statically AND by expanding template-literal prefixes
against English — and requires all three offered locales to define them; no duplicate keys; no key
rendered as itself; no internal enum name inside a translation; identical placeholders across the
three.

**Unit — `engine-purity.test.ts`** `REQUIRED_LOCALES` now derives from `OFFERED_LOCALES` instead
of being `['en','es']`, so engine messages are guarded in Portuguese too.

**E2E — `e2e/i18n-languages.spec.ts` (14)**
seven browser locales (`en-US`, `es-AR`, `pt-BR`, `fr-FR`, `de-DE`, `it-IT`, `ja-JP`) each opening
PRO and reading the screen; the picker's exact contents; a retired locale never restored and the
picker never blank; a language switch that does not touch the model, the design or the solve
counter; the choice surviving a reload; and — once per language — the full workflow: empty states,
the command row, the design run, detailing, floor design, the three export buttons, the 3-D viewer
with its family names and tally, the Project view, the regulations panel, and a `.ded` saved and
reopened without the language moving.

---

## 4. Defects found and fixed

1. **721 + 111 + 62 keys missing from Portuguese** across the PRO flow — the bulk of this pass.
2. **20 strings hard-coded in components.** `VerificationDetail` rendered *Check*, *Demand / Req.*,
   *Capacity / Prov.*, *Swept*, *Category*, *Station*, *Design-driving demands*, *P-M interaction
   diagram*, *CIRSOC 201 — calculation details*, *Detailing* and the bar-length line in English in
   every language; `RebarEditorBeam` and `RebarEditorColumn` did the same with *+ row*,
   *remove row*, *! fit*, *corner Ø*, *face Ø*; `BatchEditDialog` with two more; the design table's
   keyboard hint said *space*.
3. **5 duplicate keys in `pt.ts`** (`pro.autoTopNode`, `pro.imperfRatio`, `pro.mechanism`,
   `pro.responseNode`, `pro.stable`) — the later declaration silently won.
4. **A placeholder mismatch**: `pro.constraintMpc` in `pt` carried `RHS={rhs}`, which en/es do not
   and no caller passes, so a Portuguese user would have read a literal `{rhs}` on screen.
5. **No internal enum name reaches the UI.** Checked, and now asserted: `PROVISIONAL_BIAXIAL`,
   `SECTION_INADEQUATE` and friends appear only as CSS classes and `data-` attributes.

---

## 5. Debt this pass did NOT pay

- **The detailing engine's calculation memos are Spanish-only.** `lib/engine/detailing/**` —
  `punching-shear.ts`, `splice.ts`, `generate-beam.ts` and their siblings — build their step-by-step
  reasoning as Spanish literals. They reach the memo panel and the report. They are OUTSIDE the
  purity boundary (`PURE_DIRS = ['lib/codes', 'lib/engine/loads']`) that `engine-purity.test.ts`
  guards, and moving them across it means editing the CIRSOC detailing engine — explicitly out of
  bounds for this pass. **~500 literals. This is the largest remaining i18n gap.**
- **The other eleven dictionaries** stay ~790 keys behind. They are not offered, so nothing renders
  them; re-enabling one is a single edit to `OFFERED_LOCALES` and a lot of translation.
- **`locale-parity.test.ts`** still scopes its all-14-locales check to `design.*`. Correct while
  those eleven are unoffered; the new gate covers the three that are.
- **PRO surfaces outside A–D** — Loads/Advanced/Shell/Connections/Constraints — have their keys in
  all three (the coverage gate spans `components/pro`), but no E2E reads them in each language.
