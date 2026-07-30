# PR19 foundation findings — clear spacing and footing containment

Resolved with production-code evidence before freezing fixtures or implementing the pipeline, as
required by the Bundle B plan. Measured on `pr/19-rc-cad-constructibility`.

**Outcome: question 1 is resolved and needs less new code than the decision brief assumed.
Question 2 uncovered a material architecture decision and is presented for the user, not chosen.**

---

## Question 1 — required clear spacing: RESOLVED, and my earlier brief was too pessimistic

`docs/poc/rc-footing-cad-architecture-decisions.md` states that a "read-only required-clear-spacing
accessor" must be added, because `detectCollisions` receives `requiredClearFor` as a
caller-supplied callback and therefore never materialises the numbers.

**That was an incomplete reading.** Tracing the callback to its source shows the authoritative rule
is already implemented, already exported, and already returns more than the manifest needs.

### The authoritative rule

| Symbol | Location | Exported | Returns |
|---|---|---|---|
| `minClearSpacingFor(edition, memberKind, {...})` | `web/src/lib/codes/cirsoc201/spacing.ts` | **yes** | the code minimum clear spacing, m |
| `minClearBetweenLayers` | same | **yes** | layer-to-layer minimum, m |
| `classifyPair(a, b, ctx)` | `web/src/lib/engine/detailing/classify.ts:266` | **yes** | `PairClassification` |
| `PairClassification` | `classify.ts:94` | **yes** | `{ pairClass, requiredClear, reportable, refs: ClauseRef[], labelKey }` |
| `ClassificationContext` | `classify.ts:106` | **yes** | `{ edition, maxAggregateSizeMm, memberKindOf }` |
| `PARALLEL_THRESHOLD = 0.5`, `CONTACT_ALLOWANCE = 0.002` | `classify.ts:162, 209` | **yes** | constants |
| `DEFAULT_TOLERANCES.requiredClear = 0.025` | `collision.ts:56` | **yes** | tolerance default |

Existing production callers of the same rule: `detailing/candidates.ts:201`,
`design/adapters/cirsoc201-adapter.ts:124`, `detailing/coordinate-floor.ts:538`. The floor
coordinator builds its `requiredClearFor` as a one-line closure over `minClearSpacingFor` — so the
callback is an *injection seam*, not a hiding place.

### Why this is better than an accessor

`classifyPair` already returns, per bar pair:

- `requiredClear` — the number the manifest needs;
- `refs: ClauseRef[]` — **the clause the requirement comes from**, which populates
  `requirements.clauseRefs[]` with real provenance instead of leaving it optional;
- `reportable` — whether a shortfall should be reported at all, which the CAD side must respect or
  it will report conflicts Stabileo deliberately does not;
- `labelKey` — an i18n key, so EN/ES text reuses PR16's structured messages rather than inventing
  strings.

`PairClass` distinguishes `prohibitedOverlap` (bar surfaces interpenetrate — *never* acceptable and
never tolerance-adjusted), `cageSpacing`, `requiredContainment`, `spliceLap` and others. A generic
geometric checker cannot infer those distinctions, which is precisely why Stabileo stays
authoritative for classification.

### Narrowest change actually required

**No new rule code, and no new accessor in the engine.** The exporter calls the existing
`classifyPair` over the bar pairs it is already emitting, with a `ClassificationContext` built from
the persisted regulation edition and material aggregate size, and serialises the result. The only
new code is serialisation inside the exporter.

This makes the licence boundary cleaner than planned: Stabileo emits `requiredClear` **plus the
clause reference and the reportable flag**, and the CAD side measures against numbers it is told,
never inferring a rule. No CIRSOC logic crosses to MIT.

**Status: approved implementation requirement, unblocked, smaller than estimated.**

---

## Question 2 — footing containment: NOT covered, and not by anything else either

The decision brief flagged that `SectionPrism` models a prismatic member and asked whether PR18
footings are covered by that containment path. The answer is sharper than expected.

### `checkCover` has no production callers

Every reference to `checkCover` in `web/src`:

| Reference | Kind |
|---|---|
| `engine/detailing/collision.ts:612` | its own definition |
| `engine/detailing/__tests__/bar-geometry.test.ts:8, 342, 347, 353, 362, 373` | tests only |

**7 references, 1 definition, 6 test call sites, 0 production callers.** `checkCover` is
implemented and unit-tested but **not wired into any production path** — not for footings, and not
for beams or columns either.

So the correct statement is not "footings are not covered by `SectionPrism`". It is:
**Stabileo has no post-hoc geometric containment verdict in production at all.**

### How cover is actually achieved: by construction

Cover is a **placement input**, not a verified output. In `engine/detailing/floor-design.ts`:

```
footingThickness: number;          // Footing thickness, m
footingCover: number;              // Bottom cover in the footing, m
…
const available = input.footingThickness - input.footingCover - 0.05;
const needsHook = input.ldFooting > available;
```

and for slab panels, `inset = panel.cover + d / 2 + (layer.direction === 'y' ? d : 0)`.

Bars are *placed* at the correct cover arithmetically. Nothing afterwards measures whether the
resulting 3-D geometry actually sits inside the concrete. That is a defensible design — it is how
most detailers work — but it means there is **no authoritative containment verdict to cross-check
against**.

### What the manifest *can* still carry, from persisted data

`web/src/lib/model/footing.ts` gives everything the geometry and the requirement need:

| Field | Use |
|---|---|
| `Footing.id`, `.name`, `.nodeId`, `.kind` | identity |
| `.B`, `.L`, `.thickness` | pad solid |
| `.rotationDeg`, `.eccentricityB`, `.eccentricityL` | placement/frame |
| `.cover` | **`requirements.cover` — authoritative, persisted** |
| `.concreteMaterialId`, `.rebarMaterialId` | material provenance |
| `Pedestal.B`, `.L`, `.height` | optional pedestal solid |

So required cover is real, persisted and exportable. Only the *measured achieved* cover is absent.

### Why this is a material decision

`RcCadHandoffV1` specifies `stabileoVerdict` as required, so the CAD side can classify agreement or
disagreement. For collision that verdict exists (`detectCollisions` is wired into the floor
coordinator). **For containment it does not.** Three ways forward, with materially different scope:

#### Option 2-A — declare containment unsupported on the Stabileo side

Emit `requirements.cover` (real) and mark containment as **not verified by Stabileo** in
`unsupportedConditions[]`. The CAD containment check is then the *only* containment check, reported
as a primary finding rather than a cross-check.

- **Scope:** smallest. Exporter only.
- **Honesty:** high — it says exactly what is and is not verified, which is the house style.
- **Engineering value:** the CAD side genuinely adds a capability Stabileo lacks, rather than
  duplicating one.
- **Risk:** a CAD-side containment failure has no second opinion, so a CAD bug looks like a design
  defect. Mitigated by the fixtures: the clean fixture must report zero containment issues, so a
  false positive is caught immediately.
- **Product consequence:** Stabileo gains no new internal check.

#### Option 2-B — wire the existing `checkCover` into the footing path

Give footings a `SectionPrism`-equivalent and call `checkCover` in production.

- **Scope:** materially larger, and it changes **product behaviour**, not just export. `SectionPrism`
  is `{ halfWidth, halfHeight, origin, axis }` — a prism about a member axis. A footing pad is a box
  with `B`, `L`, `thickness` and `rotationDeg`; representing it as a prism about a vertical axis is
  possible but is a new geometric abstraction plus a new production check.
- **Risk:** this is the highest-risk option. A newly-wired check on a mature detailing path may
  start failing existing production fixtures — legitimately (it finds real defects) or spuriously
  (the abstraction mismatches). Either way it is a PR-sized change with its own review, and it is
  **outside the Bundle B slice** the user approved.
- **Value:** Stabileo gains a real internal check and a genuine verdict to cross-check. Best
  long-term.
- **Note:** the existing tests in `bar-geometry.test.ts` prove `checkCover` works for prisms; they
  say nothing about pads.

#### Option 2-C — export cover as placement intent; CAD measures achieved cover

Stabileo emits required cover per face (persisted `Footing.cover`) **and** the placement arithmetic
it used. CAD measures achieved cover from the solids. Disagreement means Stabileo's *placement*
produced geometry that does not satisfy its own requirement — a placement bug.

- **Scope:** exporter only, same as 2-A, plus emitting the arithmetic inputs already available.
- **Value:** this is arguably the strongest cross-check of the three. It does not duplicate a
  verdict; it independently audits the **cover-by-construction assumption** that currently has no
  verification anywhere. That is a real gap being closed rather than a number being recomputed.
- **Risk:** medium — it will find genuine discrepancies if placement arithmetic and realised
  geometry ever disagree (e.g. a hook turned outward, which is exactly the case `checkCover`'s
  docstring names). Those findings are *valuable*, but they are new information the user has not
  seen before and may need triage.
- **Product consequence:** no change to product behaviour; new evidence about it.

### Recommendation

**Option 2-C, with 2-A's honesty framing, and 2-B deferred to its own PR.**

Reasoning: 2-C keeps the approved Bundle B scope (exporter + CAD check, no production behaviour
change), and it turns the absence of a containment verdict from a gap into the most interesting
result the POC can produce — an independent audit of an assumption nothing currently checks. It
should be *labelled* as 2-A demands: `unsupportedConditions[]` states plainly that Stabileo does not
itself verify containment, so a CAD containment finding is never mistaken for a confirmed Stabileo
verdict. 2-B is the right end state but is a separate, product-behaviour-changing PR that should not
ride inside a POC slice.

**Stopping here before making this choice, as instructed.** The exporter's `stabileoVerdict` shape
and `unsupportedConditions[]` content depend on it.

---

## What is unblocked regardless of the decision

These are identical under 2-A, 2-B and 2-C and can proceed:

- Manifest envelope, identity, revisions, certificate, units, coordinate frame.
- Concrete geometry from `Footing` / `Pedestal` (`B`, `L`, `thickness`, `rotationDeg`, eccentricities).
- Bars: `BarPath` with exact `BarSegment` arcs including `centre`, roles, marks, `layerId`,
  `ownerElementIds`, `cuttingLength`, diameters, material refs.
- `requirements.cover` from persisted `Footing.cover`.
- `requirements.clearSpacing` **and** `clauseRefs` via the existing `classifyPair`.
- Collision `stabileoVerdict` from the already-wired `detectCollisions`.
- Deterministic ordering, serialisation, JSON Schema, schema + semantic validation.

Only the **containment** portion of `stabileoVerdict` and the corresponding
`unsupportedConditions[]` wording are blocked.

## Corrections to the decision brief

1. **"A read-only required-clear-spacing accessor must be added"** — superseded. `classifyPair` and
   `minClearSpacingFor` are already exported and return more than needed. Only serialisation is new.
2. **"Whether PR18 footings are covered by `SectionPrism` containment is unverified"** — now
   verified: **nothing** is, because `checkCover` has no production callers. The gap is broader than
   footings, and correspondingly more interesting.

So of the "two missing adapters", one dissolves into serialisation and the other (the STEP/GLB
writer) remains exactly as described — it is the CAD side's whole reason for existing here.

---

## DECISION RECORDED — 2026-07-30: Option 2-C with 2-A's honesty

The user selected **2-C with 2-A's explicit honesty**. **2-B is not implemented in PR19** and is
recorded as a probable **PR20** feature in `docs/handoffs/deferred-cover-validation-pr20.md`.

What this means concretely for PR19:

| Rule | Consequence |
|---|---|
| Stabileo owns and exports the cover requirement or placement intent **already present in the production model** | `Footing.cover` and `floor-design.ts` `footingCover` are exported as-is. The existing value is preserved; **50 mm is never hard-coded** |
| Stabileo reports footing containment as **`NOT_EVALUATED`** | because `checkCover` has zero production callers — the reason is stated in the artifact, not implied |
| CAD measures achieved cover **independently** | as a geometric review observation |
| A CAD measurement is **not** a Stabileo regulatory verdict or certificate | the review artifact must label it as an observation |
| CAD must **never** convert `NOT_EVALUATED` into `PASS` | the review carries a distinct `NOT_COMPARABLE` state |
| Generalized authoritative cover validation | deferred to probable PR20 |

### Schema consequences — implemented in `web/src/lib/export/rc-cad-handoff.schema.json`

Cover is **not** a global scalar. `requirements.cover` is a **list** of `coverRequirement`, each
keeping separate: `requirementId`, `elementId`, `elementType`, optional `surface`
(`face`/`region`/`note`), optional `appliesToBarIds`, `distance`, `unit`, `category`
(`placementInput` | `codeDerived` | `userSpecified` — only categories the model actually
distinguishes today) and `provenance` (`source`, `clauseRefs`, `messageKey`).

`surface` **absent means Stabileo does not model a per-surface distinction** — a real limitation, not
a wildcard. `face` is an open string rather than a closed enum precisely because the production model
has no face roles yet; fixing an enum now would encode guesses. A later `schemaVersion` can close it.

Results are **per check**, never one aggregate boolean. Each `check` carries its own `checkId`,
`checkKind` (`barCollision` | `barClearSpacing` | `concreteCover` | `reinforcementContainment`),
`authority` (`stabileo` | `none`), `evaluationStatus` (`EVALUATED` | `NOT_EVALUATED`), a
**required** `notEvaluatedReason` when not evaluated (enforced by a JSON Schema `if/then`),
`requirementIds`, `scope` and `findings`. So collisions, clear spacing, cover and containment never
get conflated.

The PR20 migration needs no schema redesign: only `authority`, `evaluationStatus` and the presence of
`findings` change, and `requirementId` keys stay stable.

---

## F-2 fixture: the verified production recipe — 2026-07-30

The user selected **F-2**: a new dedicated committed project fixture containing a footing, loaded
through the real production `ModelSnapshot` restoration path. The exact production path is now
traced and verified. **[FACT]** unless marked otherwise.

### Why a `.ded` project fixture, not a `templates/fixtures/*.json`

Those are two different formats and only one goes through snapshot restoration:

| Format | Loader | Restores a snapshot? |
|---|---|---|
| `templates/fixtures/*.json` — keys `nodes`, `elements`, `materials`, `sections`, `supports`, `loads`, `combinations`… | `loadFixture(json, api)` (`lib/templates/load-fixture.ts:76`) — replays creation calls | **No.** It replays `addNode`/`addElement`/… with ID remapping |
| `.ded` project — `DedalFile { version, name, timestamp, snapshot, appMode, analysisMode, … }` | `deserializeProject(text)` (`lib/store/file.ts:116`) → `modelStore.restore(data.snapshot)` | **Yes** |

So the canonical F-2 fixture must be a **`DedalFile`**, produced by `serializeProject()`
(`file.ts:97`) and read back by `deserializeProject()`. That is the path the user's own
Open/Save actions use, and it is the only one that exercises `modelStore.restore`.

### Base model

`lib/templates/fixtures/rc-design-qa-8.json` — the RC design QA model already used by the
detailing suites. 8 nodes, 8 elements, **4 `fixed3d` supports at nodes 1–4**, which are exactly the
ground nodes a footing attaches to. **It is not modified.** It is loaded, extended in memory, and
serialised to a new file.

### Production actions for the footing

The same store actions `components/pro/design/FoundationsPanel.svelte` calls, and the same ones
`lib/store/__tests__/footing-persistence.test.ts` already exercises:

```
loadFixture(rcDesignQa8, modelStore)          // production example loader
const profileId = modelStore.addSoilProfile('…')
modelStore.updateSoilProfile(profileId, { bearing: { … }, provenance: { … } })
const footingId = modelStore.addFooting(nodeId, 'Z1')
modelStore.updateFooting(footingId, { B, L, thickness, … })
serializeProject()                             // -> the committed .ded fixture
```

No hand-authored parallel schema, and no second footing model.

### Derived state is recomputed, never seeded — [FACT]

`DetailingAssembly` (bars, marks, conflicts, `detailingRevision`, `demandRevision`, `maturity`) is
**derived** and is not part of `ModelSnapshot`. So the fixture persists only the project, and the
test restores it and then runs the **production** design/detailing action
(`detailingStore` → `runFootingDesign` → `buildFloorAssembly`) to obtain the assembly. Detailing
output is never written into the fixture.

### Footing inputs — [PROPOSED], to be selected when the fixture is generated

Plausible in-domain values, **not** claimed to come from a real project or a regulatory
derivation. `cover` is carried by the model (`Footing.cover`) and the exporter reads it from there —
**50 mm is never hard-coded** in the exporter, the schema, the CAD consumer or any assertion. Each
selected input will be documented alongside the fixture when it is generated.

### Status

Recipe verified; **fixture not yet generated and exporter not yet written.** Stopping at this clean
checkpoint rather than beginning a multi-file exporter that could not be completed and tested in the
same pass — a half-wired cross-repository change is worse than a documented, verified plan.
