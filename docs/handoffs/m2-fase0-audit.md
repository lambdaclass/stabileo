# M2 · Fase 0 — audit before implementing

Branch `feat/pro-steel-m2`, PR #164 (draft), base `feat/pro-steel-m1`. Nothing in this
document was implemented yet; it is the map the rest of the scope is built on.

Everything below was **measured**, not recalled. Where a claim came from running code, the
command is named.

---

## 0. The headline: nothing has to be ported from `main`

The brief asks which commits of `main` carry the current selector, and to port only the
necessary pieces. The answer is that **there is nothing to port**:

```
git merge-base --is-ancestor a579d5b0 HEAD          → yes
git diff HEAD origin/main -- ProfileSelector.svelte
                             MaterialPresetSelector.svelte → empty
```

Both Basic selectors are already in this branch, **byte-identical to `main`**. The commits
that produced them, for the record:

| Piece | Commit | What it did |
|---|---|---|
| `SectionChanger.svelte` + `section-catalog.ts` | **`a579d5b0`** | "one outline everywhere, and a picker organised by design code" |
| `MaterialPresetSelector.svelte` | **`2ab88694`** | "modernise the pickers" |
| grade thickness bands | **`8e2240b1`** (PR #145) | `bandSummary`, the band a quoted `fy` belongs to |
| `Material.gradeId` | **`d1ba4fb2`** (PR #132) | the declared-grade field the family inference prefers |

So no merge, no cherry-pick, no provenance note. The work is **re-pointing PRO at code that
is already here**, which is a much smaller and much safer change than importing.

## 1. The finding that reorders the whole scope

**PRO's section picker is a fork of the *old* Basic picker, and Basic has since moved on.**

`ProSectionsTab.svelte` imports `FAMILY_LIST` and `PROFILE_FAMILIES` from `steel-profiles.ts`
— a **flat list of 15 families** — and renders them as a tab strip. That is exactly what
`ProfileSelector.svelte` (Basic, 298 LOC) still does.

But Basic's real picker is no longer that one. It is **`SectionChanger.svelte` (938 LOC)**,
and it already consumes `section-catalog.ts`:

```ts
import { DESIGN_CODES, familiesForCode, groupBySeries, classifyFamily }
  from '../lib/data/section-catalog';
```

`section-catalog.ts` is the piece that matters, because **it already carries the entire
taxonomy the brief asks for**:

| The brief asks to organise by | The field that already exists |
|---|---|
| familia | `FamilyClassification.family` |
| norma | `.standard` — *dimensional* standard (DIN 1025-1, EN 10365, IRAM-IAS U 500-42) |
| país / organismo | `.country` + `.standardsBody` (`DIN`/`CEN`/`IRAM-IAS`/`ASTM/AISC`) |
| catálogo | `DESIGN_CODES` — CIRSOC 301, Eurocode 3, AISC 360, NBR 8800 |
| laminado / conformado en frío | `.material`: `hot-rolled-steel` \| `cold-formed-steel` |
| perfiles disponibles | `familiesForCode()`, `groupBySeries()` |

And it keeps a distinction worth preserving, stated in its own header: **a design code does
not define profiles**. CIRSOC 301 says how to verify a member; the dimensions come from a
dimensional standard. `DESIGN_CODES[].missingFamilies` even names what a code's practice uses
that is *not* shipped — including, literally, `'C/Z conformados en frío (CIRSOC 303)'`.

**Consequence for the plan:** item 1's "organise the catalogue" is not a data-modelling job.
The data model exists and is tested (`__tests__/section-catalog.test.ts`,
`code-catalogue-integrity.test.ts`). The job is to build the PRO modal on top of it. That
moves item 1 from "large" to "medium" and is why the phases below start there.

### What PRO must NOT copy from Basic

`SectionChanger` has **three** main tabs: `profile` | `shape` | `amorphous`. The brief says
PRO has **exactly two** divisions and *"no ofrezcas una sección amorfa sin estructura"*.

So the PRO modal is not a re-mount of `SectionChanger`. It shares its **data layer** and drops
its third tab. That is a deliberate divergence, and it should be pinned by a test that fails
if an amorphous path ever appears in PRO.

### And what Basic is not a model for

The brief says the PRO experience should be *coherent with* Basic's. It should not inherit its
implementation, because Basic's picker does not meet the bar the brief itself sets:

| The brief requires | `ProfileSelector.svelte` today |
|---|---|
| teclado completo | only `Escape`. Rows are `<tr onclick>` — **not reachable by keyboard at all** |
| foco al abrir y cerrar | none. No focus trap, no restore on close |
| — | `role="dialog"` without `aria-modal`; backdrop is a click target with no accessible name |
| tokens | **seventeen hardcoded hex values** (`#16213e`, `#4ecdc4`, `#e94560`), no `--st-*` |

`SectionChanger` is better organised but shares the keyboard and token gaps. PRO already has
the `--st-*` system (see `project-stabileo-sistema-visual`), so the modal is written against
tokens from the start, and keyboard/focus is built rather than inherited.

## 2. The shared contract already exists — in the wrong place

`ProfilePicker.svelte` (generators) **already implements three of item 1's four asks**:
compound arrangements, gap, and rotation. The contract is `ProfileSpec`:

```ts
// lib/engine/generators/emit.ts:41
export interface ProfileSpec {
  profileName: string;                  // 'IPE 160', 'L 75x75x6'
  arrangement: BuiltUpArrangement;      // 7 values, see below
  gapMm: number;                        // el huelgo
  rotationDeg: number | 'auto';         // 'auto' defers to the generator's per-member roll
}
```

`BUILT_UP_ARRANGEMENTS` ships **seven**: `single`, `doubleBack` (espalda con espalda),
`doubleFacing`, `doubleParallel`, `doubleX`, `quadBack`, `quadBox`. Each declares `closed`,
which decides whether `J` may be summed — a closed arrangement **reports no J rather than a
wrong one**.

**The problem is location.** `ProfileSpec` lives in `generators/emit.ts`, so it is a
generator-private type. The brief requires the composition to *"poder usarse tanto fuera de
los generadores como dentro de ellos"*, and requires selector, generator and visualisation to
share **one source of truth** for rotation.

That is the single most important structural decision in this scope:

> **Lift `ProfileSpec` out of `generators/` into a shared module, and make the model able to
> carry it.** Everything else in items 1, 3 and 7 depends on it.

Today a section in `modelStore` records a profile name and computed properties. It does not
record *"this is two L 75×75×6 back to back at 10 mm, rotated 90°"*. Until it does, a compound
section chosen outside a generator cannot survive a save, and the 3D view cannot draw the two
parts and the gap. **This is the contract to design before touching any component.**

### Battens (presillas): not modelled

`built-up-section.ts` mentions the "battened box column" in a comment and nowhere else. There
is **no batten spacing, count, thickness or geometry** anywhere in the codebase. Item 1's
"debe mostrar presillas si corresponden" therefore has no data to show. Under the standing
rule this must read `GEOMETRY_UNAVAILABLE` with the reason, not a drawn guess — unless the
scope is extended to *specify* battens, which is a design decision, not an implementation one.

### Cold-formed C/Z: the catalogue is empty on purpose

```ts
// lib/profiles/cold-formed-catalogue.ts:112
export const NO_SOURCED_SERIES: readonly ColdFormedSpec[] = Object.freeze([]);
```

Zero commercial rows, and the header says why: *"No rows are invented to make a picker look
populated."* `byId()` resolves any valid designation parametrically; `COLD_FORMED_BASIS` is
`'derivedFromGeometry'`.

This already matches the brief exactly — *"mantené el selector paramétrico y explicá la
ausencia de catálogo"*. The change is **where it lives**: today `ColdFormedPanel.svelte` (307
LOC) is reached as a workflow stage, and the brief says C/Z belong in the section selector.
So the panel moves into the modal's "paramétricos" branch; its logic does not change.

## 3. Two blocking bugs, both traced to a specific line

### 3a. The regulation gate can never open

Symptom: *"después de calcular la nave, elegir un reglamento no permite avanzar."*

```ts
// lib/codes/roles.ts:570
export function roleUsable(reg, role) {
  const b = reg[role];
  if (!b.adapterId) return false;
  const opt = findOption(b.adapterId);
  if (!opt || opt.maturity === 'UNSUPPORTED') return false;   // ← here
  return b.configComplete;
}
```

and:

```ts
// lib/codes/roles.ts:257
adapterId: 'cirsoc301-2018', role: 'steel', …, maturity: 'UNSUPPORTED', experimental: true,
```

`regulationsStore.usable('steel')` is therefore **false by construction, permanently**.
Anything gated on it — `steelStore.steelCodeUsable`, and any workflow stage that reads it —
cannot be unblocked by choosing a code, because choosing the code is not what it tests.

There is no `cirsoc301-adapter.ts`; `lib/engine/design/adapters/` has only the CIRSOC 201 one
plus the 301 *capabilities* and *clause map*. The `UNSUPPORTED` maturity is an accurate
description of that, and **it should not change**.

What changes is which question the workflow asks. The store already separates them:

```ts
get steelCodeDeclared() { return steelDeclared(); }   // binding present
get steelCodeUsable()   { return authorityBound(); }  // false everywhere today
```

Progress through the workflow must gate on `steelCodeDeclared`; only a *certified result*
gates on `usable`. This is the same correction already applied to `verificationState`, and it
is what the brief means by *"seleccionar un reglamento no implica que el diseño esté
verificado"*.

### 3b. Joint detection: the pure pipeline is not the bug

Symptom: *"la app no detecta nudos ni permite avanzar."*

I reproduced the default industrial shed end to end, twice — once through the pure functions,
once through the real stores (`applyGeneratedModel` → `modelStore` → `steelStore`):

```
APPLIED nodes/elements/sections: 300 625 5
store materials: [{"id":1,"name":"Acero A36","e":200000,"nu":0.3,"rho":78.5,"fy":250}]
steelStore.members: 625      emptyReason: null
metallic set size: 625
JOINTS via store: 300
```

**300 joints, 625 metallic members, nothing filtered out.** `detectJoints` is correct, the
`isMetallic` predicate is correct, and `applyGeneratedModel` writes a material the family
inference reads as steel (`fy = 250 > CONCRETE_FY_CEILING = 80`).

So the defect is **above** this layer — the tab, its gating, or the render — and Fase 0 stops
here rather than guessing. Phase 6 opens with a Playwright reproduction against the real shed
on a free `E2E_PORT`, which is the only place the remaining candidates can be told apart.

> One correction worth recording, because it nearly became a false accusation. My first
> diagnostic filtered `m.family === 'steel'` and reported **0 metallic elements** — which
> would have read as a real bug. `SteelMemberEntry.family` is a `MaterialFamilyVerdict`
> **object**, not a string; the panel's `isSteel(m.family)` was right and my probe was wrong.
> The app was never at fault here.

## 4. Pratt and Howe are swapped

```ts
// lib/engine/generators/truss-topology.ts:284
const risesToCentre = (p.webPattern === 'pratt') === leftOfCentre;
if (risesToCentre) web(bottomIdx[i], topIdx[i + 1], 'diagonal');
```

For `pratt` on the left half this runs bottom→top moving inward: **Pratt diagonals currently
rise toward midspan.** The header says so explicitly ("Pratt diagonals rise towards midspan
and go into tension").

That is Howe. Checked by statics rather than by memory: cut a panel in the left half and take
the left free body. The support reaction is up, so the diagonal's vertical component on that
body must be **down**. A diagonal running from top-left down to bottom-right, in tension,
pulls the body down-and-right. ✔ — and that diagonal **descends toward the centre**. The
current one rises, so it can only be in compression, which is the Howe action.

The brief and the statics agree. The fix is the comparison operator, plus the header, the
name `risesToCentre`, and whatever tests pin the present orientation — a truss generator is
not somewhere to change a sign without reading its tests first.

**Warren** (item 4) does not exist: `WEB_PATTERNS = ['pratt', 'howe']`. It is new topology,
not a variant, and needs its own connectivity and mechanism tests. The **Pratt subdivision**
option is likewise new, and per the brief must not be called "Baltimore" in the UI.

## 5. Two UI defects confirmed by inspection

**Generator preview scrolls away.** `ProGeneratorsPanel.svelte` is one scrolling column
(`.gen { height: 100%; overflow-y: auto }`) with `<TopologyPreview>` inline at lines 489–505.
There is no sticky region, so it leaves the viewport as soon as the parameters are scrolled —
exactly the reported behaviour. Item 3 needs a docked footer with an unlock affordance.

**Native number arrows overlap the value.** 17 `type="number"` inputs in that panel, and
`grep` finds **no `-webkit-inner-spin-button` rule** for any of them anywhere in the styles.
The one `appearance: none` in `ProPanel.svelte:1034` belongs to something else. Confirmed.

## 6. Node spheres

Three different radii are in play: `nodes-instanced.ts` (shared instanced geometry, radius
passed in), `Viewport3D.svelte:1081` at `0.08`, and `:1519` at **`0.15`** — the large one.
`uiStore.renderMode3D` is already `'wireframe' | 'solid' | 'sections'` **with separate Basic
and PRO values** (`ui.svelte.ts:178–179, 597–598`), and `Viewport3D.svelte:2458` branches on
`'sections'`. So the mode item 7 needs already exists; what it lacks is a node treatment that
changes with it.

The picking-bench work earlier in M2 measured this: picking is **not** broken (the 0 % result
was my probe aiming at the sphere's polar singularity), and click theft is 0 %. The real
defect is visual only — the marker spans **8 px to 144 px** across the working zoom range.
That measurement stands and is the baseline to beat, per node count, on the shed and on one
truss.

---

## File map

**Read-only in this scope** (audited, not to be edited): `StageSection.svelte`, the solver,
Rust/Cargo/WASM, Basic surfaces except where a selector is *reused*, `connection-design.ts`
(its `detectJoints` is correct — changes go in callers).

| Layer | Files | Role in this scope |
|---|---|---|
| **Contract (new)** | `lib/section/profile-spec.ts` | `ProfileSpec` lifted out of `generators/emit.ts`; the one truth for arrangement + gap + rotation |
| **Catalogue (reuse)** | `data/section-catalog.ts`, `data/steel-profiles.ts`, `data/iram-*.ts` (~720 profiles), `profiles/cold-formed-catalogue.ts` | already carries family/standard/body/country/material/series |
| **Materials (reuse)** | `data/material-presets.ts`, `data/structural-grades.ts` (841 LOC), `non-metal-grades.ts`, `code-lore.ts` | grades, product code, design code, **thickness bands**, provenance |
| **Selector (new)** | `components/pro/section/ProSectionModal.svelte` + subpanels | two divisions; modal; keyboard; focus; ficha |
| **Selector (new)** | `components/pro/material/ProMaterialModal.svelte` | adapts `MaterialPresetSelector` to `--st-*`, no duplicated catalogue |
| **Selector (move)** | `pro/steel/ColdFormedPanel.svelte` | out of the workflow, into the modal's parametric branch |
| **Generators (edit)** | `ProGeneratorsPanel.svelte`, `ProfilePicker.svelte`, `ProfileSelectorPanel.svelte`, `TopologyPreview.svelte` | sticky preview, number inputs, profile rows, open the shared modal |
| **Topology (edit)** | `generators/truss-topology.ts` | Pratt/Howe swap, Warren, subdivision |
| **Workflow (rewrite)** | `ProSteelWorkflowTab.svelte` (649 LOC, 8 stages) | → 5 stages, sticky timeline |
| **Joints (edit)** | `ProConnectionsTab.svelte` (636 LOC) | the caller, once phase 6 identifies the UI-level cause |
| **3D (edit)** | `Viewport3D.svelte`, `lib/three/nodes-instanced.ts`, `section-profiles.ts` | contextual gizmo, section mode |
| **Gate (edit)** | consumers of `regulationsStore.usable('steel')` | `declared` for progress, `usable` for certification |

## Phases

Each ends with the full gate from item 8, and its own commit. Phases 1–2 come first because
every later phase consumes their contract.

| # | Phase | Depends on | Why here |
|---|---|---|---|
| **1** | Lift `ProfileSpec`; make the model carry composition + rotation | — | items 1, 3 and 7 all read it |
| **2** | PRO section modal: two divisions, catalogue over `section-catalog.ts`, keyboard, focus, ficha; C/Z moves in | 1 | the largest single deliverable |
| **3** | PRO material modal over the existing grade catalogue | — (parallel to 2) | no new data |
| **4** | Generators: sticky preview, number inputs, profile rows open the shared modal, A36 opens the material modal, visual re-audit ×3 languages ×2 sizes | 2, 3 | needs both modals |
| **5** | Truss geometry: Pratt/Howe fix, Warren, subdivision | — (independent) | can land any time; kept apart so a sign change is reviewable alone |
| **6** | Joints: reproduce in Playwright, fix the real cause, then the per-joint surface | — | starts with reproduction, not with a fix |
| **7** | Workflow rebuilt to 5 stages; regulation gate on `declared` | 2, 3, 6 | needs the joints stage to be real |
| **8** | 3D: contextual gizmo, node treatment under `sections`, measured before/after | 1 | needs composition in the model to draw it |

Phase 5 is deliberately unblocked so it can land early: it is the one item in the brief whose
correctness is decidable by statics alone.

## What Fase 0 did not settle

- **The UI-level cause of the joints symptom.** Reproduced as *not* being in the pure or store
  layer; the remaining candidates need the browser. Phase 6 opens there.
- **Battens.** No data exists. Either the scope grows to specify them, or they read
  `GEOMETRY_UNAVAILABLE`. That is a call for Bauti, not a default I should pick.
- **Whether the model file format changes.** Phase 1's contract decides it; if a compound
  section must round-trip through `.ded`, the codec is affected and that is worth naming
  before it is written.
