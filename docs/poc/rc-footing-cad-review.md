# PR19 POC — RC footing detail → 3D CAD → clash / clearance / cover review

**POC / DESIGN PHASE. No production CAD integration code exists yet.** This document is the
canonical design record for the Stabileo side. The text-to-cad fork carries a companion document,
`docs/poc/stabileo-rc-footing-cad.md`, whose shared-contract table must stay identical to §4 here;
**this document is canonical** and the fork's copy follows it.

Scope: one **isolated footing**, taken from a real PR18 production fixture. Modal FEA is out of
scope — this POC does not depend on text-to-cad PR #22 and does not install Netgen/NGSolve.

---

## 1. The finding that shapes the whole design

**Stabileo already does bar-to-bar collision and cover containment, and does it well.**

`web/src/lib/engine/detailing/collision.ts` implements a broad-phase uniform spatial hash with an
exact narrow phase over sampled segments, `O(n·k)` in local density rather than `O(n²)`. It is
arc-aware, and its own commentary documents the sagitta error that linear arc interpolation caused
(5.9 mm on a Ø8 stirrup 90° bend, 12.3 mm on a 135° hook — both larger than the bars being
checked). `detectCollisions` takes its classification rules by name because passing them
positionally produced a real defect twice. A separate check verifies every bar sits inside the
concrete respecting cover.

So the CAD side is **not** where clash detection should move. If this POC treated text-to-cad as
the collision authority it would replace a regulation-aware, arc-exact, tested checker with a
generic one — a regression dressed as an integration.

What the CAD side is genuinely good for:

1. **Artifact generation** — STEP and GLB, which Stabileo cannot produce (it emits DXF R12, 2D).
2. **Visual inspection** — CAD Viewer is a ready-made 3D review surface for a human or an agent.
3. **An independent second opinion** — a geometric check written against a different codebase,
   from the same manifest, is a real cross-validation of Stabileo's own verdict. Agreement is
   evidence; disagreement is a bug in one of them and worth knowing.

The POC is therefore framed as **export + inspect + cross-check**, not *export + outsource*.

---

## 2. PR15–PR18 production foundation

Audited against the real code on `pr/19-rc-cad-constructibility` (ancestors: PR15 `7d0ab24ef`,
PR16 `b13c81ce8`, PR17 `86b8b3ace`, PR18 `d19588ef3`). No duplicate footing or reinforcement model
is created by this POC — every datum below is consumed from its existing owner.

| Required POC datum | Owner | Production type | Exact file | Persisted | Caller | Units / coords | Revision owner | Maturity | Usable |
|---|---|---|---|---|---|---|---|---|---|
| Footing geometry (plan, thickness, pedestal) | PR18 | footing model entity | `lib/model/footing.ts` | persisted (model) | design + detailing + drawings | m, model axes | model revision | production | **direct** |
| Ground / bearing conditions | PR18 | geotechnical entity | `lib/model/geotechnical.ts` | persisted | footing design | kPa, m | model revision | production | **direct** |
| Supported column region | PR17/PR18 | element + section | `lib/model/*`, section geometry | persisted | detailing | m | model revision | production | **direct** |
| Physical bar centrelines | PR17 | `BarPath` | `lib/codes/cirsoc201/bar-geometry.ts` | derived, transient | detailing → drawings | m, `Point3` | detailing revision | production | **direct** |
| Straight / arc segments | PR17 | `BarSegment` (`kind: 'straight' \| 'arc'`, `radius`, `sweepDeg`, `centre`, `length`) | same | derived | collision, drawings | m, degrees | detailing revision | production | **direct** — `centre` present, so arcs are reconstructable exactly |
| Bend radius | PR17 | `centrelineRadius`, `minMandrelDiameter` | `engine/detailing/run-detailing.ts` | derived | detailing | m | detailing revision | production | **direct** |
| Hooks | PR17 | `BarEndTreatment` = `straight \| hook \| continuous`, `HookGeometry`, `HookAngle` | `bar-geometry.ts`, `transverse-cage.ts` | derived | detailing | m, degrees | detailing revision | production | **direct** — emit only when `kind === 'hook'` |
| Reinforcement role | PR17 | `BarRole` on `BarPath.role` | `bar-geometry.ts` | derived | marks, drawings | — | detailing revision | production | **direct** |
| Bar mark | PR17 | `BarMark`, `assignMarks(bars, prefix)` | `engine/detailing/assembly.ts` | derived | schedules, drawings | — | detailing revision | production | **direct** |
| Layer identity | PR17 | stable string, e.g. `e184:bottom:0` | `bar-geometry.ts` | derived | collision, drawings | — | detailing revision | production | **direct** — use as part of stable body IDs |
| Owning members | PR17 | `ownerElementIds: number[]` | `bar-geometry.ts` | derived | coordination | — | detailing revision | production | **direct** — traceability anchor |
| Cutting length | PR17 | `cuttingLength` (developed, m) | `bar-geometry.ts` | derived | schedule | m | detailing revision | production | **direct** |
| Dowels / starters / ties | PR18/PR17 | bars with roles, `transverse-cage.ts` | `engine/detailing/*` | derived | detailing | m | detailing revision | production | **direct** |
| Required cover | PR16/PR17 | section cover + code rule | `engine/detailing/collision.ts`, section geometry | mixed | collision | m | regulation + model | production | **direct** |
| Required clear spacing | PR17 | classification rules in `detectCollisions` | `engine/detailing/collision.ts` | derived | collision | m | regulation | production | **adapter** — surfaced by name internally; needs an explicit export for the manifest |
| Collision / cover verdict | PR17 | `detectCollisions`, containment check | `engine/detailing/collision.ts` | derived | assembly status | m | detailing revision | production | **direct** — this is the authority; CAD cross-checks it |
| Constructibility evidence | PR17 | `CONSTRUCTIBLE` status, `UnsupportedCondition` | `engine/detailing/assembly.ts` | derived | family record | — | detailing revision | production | **direct** |
| Family records / certificates | PR17/PR18 | family record + certificate | `engine/detailing/family-record.ts` | persisted | review, report | — | design + detailing | production | **direct** |
| Review / supersession | PR17 | review + supersession state | `engine/detailing/*`, `store/detailing.svelte.ts` | persisted | UI | — | document revision | production | **direct** |
| DocumentModel + exports | PR17/PR18 | `DocumentModel`, render, drawings | `engine/detailing/document-model.ts`, `document-render.ts`, `family-drawings.ts` | derived | DXF/XLSX/report | m | document revision | production | **direct** — the manifest is a sibling exporter, not a replacement |
| DXF export | PR17/PR18 | R12 (AC1009) writer | `lib/dxf/writer.ts` | artifact | export | m | document revision | production | **direct** — 2D only; STEP/GLB is the gap this POC fills |
| XLSX schedule | PR18 | Excel exporter | `lib/export/excel.ts` | artifact | export | — | document revision | production | **direct** |
| Corrected force signs | PR15 | compression-positive shear axial | `engine/station-design-forces.ts` | derived | verification | kN | analysis revision | production | **direct** — upstream of everything here |
| Trust / invalidation | PR15 | revision vectors, invalidation | `engine/*`, stores | persisted | whole chain | — | analysis revision | production | **direct** — the staleness signal for the manifest |
| Project Regulations + provenance | PR16 | regulation stack, edition provenance | regulation store, `codes/*` | persisted | design | — | regulation revision | production | **direct** |
| Material properties | PR16 | concrete/steel props incl. aggregate | model materials | persisted | design, detailing | SI | model revision | production | **direct** |
| Structured EN/ES messages | PR16 | structured message objects | `lib/i18n/locales/{en,es}.ts` + message types | derived | UI | — | — | production | **direct** — issue text must reuse these, not invent strings |

### Gaps requiring an adapter — only two

1. **Required clear spacing is not exported.** It is applied inside `detectCollisions` via
   by-name classification rules. The manifest needs it as data (per bar pair or per role pair). A
   thin read-only accessor is needed; the rules themselves stay put.
2. **No STEP/GLB writer exists.** Stabileo emits DXF R12 only. This is the actual capability gap,
   and it is the reason the CAD side exists in this POC at all.

Everything else is consumable directly. **Nothing needs re-modelling.**

---

## 3. text-to-cad capability on `develop` (`258236e3c`)

| Capability | Status | Evidence |
|---|---|---|
| STEP export, scene, targets, metadata, hashing | **available on develop, reusable unchanged** | `packages/cadpy/src/cadpy/step_export.py`, `step_scene.py`, `step_artifact.py`, `step_artifacts.py`, `step_metadata.py`, `step_hash.py`, `step_targets.py` |
| GLB export + topology + mesh payload | **available, reusable unchanged** | `glb.py`, `glb_topology.py`, `glb_mesh_payload.py` |
| STL / 3MF | available | `stl.py`, `threemf.py` |
| Artifact metadata, file metadata, source hashing | **available — use for determinism/staleness** | `metadata.py`, `file_metadata.py`, `source_hash.py` |
| Assembly composition / flatten / export | available | `assembly*.py` |
| Rendering + reporting | available | `render.py`, `reporting.py` |
| Skills: `cad`, `cad-viewer`, `dxf`, `step-parts` | available | `skills/` |
| **Collision / clearance / containment library** | **NOT on develop** | only `models/robots/lyra/lyra_parts/clearance.py` (model-specific) and robot collision *meshes*. No general API |
| On-demand STEP collision analysis | **open PR only** — #40, `895ee55`, **210 behind develop** | `packages/cadjs/src/common/{cadScene,renderEdges,topologyDisplayEdges,displaySettings}.js` |
| CAD Viewer feedback loop | **open PR only** — #92, `7328bbe`, 109 behind | `viewer/**`, `skills/cad-viewer/SKILL.md` |
| Solid-part modal FEA | **open PR only** — #22, **out of scope** | not used, not installed |

### Classification for contribution purposes

- **Reusable unchanged:** STEP/GLB/metadata/hash/assembly/report. This is most of what the POC
  needs on the CAD side.
- **Suitable generic upstream addition:** a *generic* rebar-agnostic solid-clearance utility, if
  one is written — it must not encode CIRSOC or any Stabileo concept.
- **Stabileo-specific, must stay out of upstream:** the `RcCadHandoffV1` importer, bar-role
  semantics, cover/spacing rules, CIRSOC clause references, issue taxonomies. These belong in
  Stabileo or in a private adapter, never in the MIT repository.
- **Licensing:** text-to-cad is **MIT**, Stabileo is **AGPL-3.0**. MIT → AGPL is a permitted
  one-way relicense; **AGPL → MIT is not**. No Stabileo code, tables or fixtures may be copied
  upstream. Anything contributed upstream must be written fresh for that repository.

---

## 4. `RcCadHandoffV1` — proposed, not finalized

A neutral, versioned, Stabileo-owned manifest. **Proposal for review.** Field set to be confirmed
against the real serialiser before implementation.

Conventions: lengths **metres**, angles **degrees**, mass **kg**, force **kN**, stress **MPa**.
Coordinates are Stabileo model axes, **Z-up, right-handed** (`docs/adr/0001-z-up-coordinate-system.md`).
Every geometric datum is expressed in the **handoff frame** defined by `origin`.

### 4.1 Envelope

| Field | Owner | Req | Unit | Space | Validation | If absent | Purpose |
|---|---|---|---|---|---|---|---|
| `schema` | Stabileo | required | — | — | literal `"RcCadHandoffV1"` | reject | contract identity |
| `schemaVersion` | Stabileo | required | — | — | `1` | reject | evolution |
| `generatedAt` | Stabileo | required | ISO-8601 | — | parseable | reject | provenance only, never an input to geometry |
| `generator` | Stabileo | required | — | — | name + version | reject | provenance |

### 4.2 Identity and revisions

| Field | Owner | Req | Unit | Space | Validation | If absent | Purpose |
|---|---|---|---|---|---|---|---|
| `project.id`, `project.name` | Stabileo model | required | — | — | non-empty | reject | traceability |
| `model.elementId` | Stabileo model | required | — | — | integer, exists | reject | anchors every issue to a real member |
| `source.gitRevision` | git | required | — | — | 40-hex | reject | exact code provenance |
| `source.branch` | git | optional | — | — | — | omit | human context |
| `revisions.analysis` | PR15 | required | — | — | integer | reject | staleness |
| `revisions.design` | PR15/18 | required | — | — | integer | reject | staleness |
| `revisions.detailing` | PR17 | required | — | — | integer | reject | staleness — the one CAD must echo back |
| `revisions.document` | PR17 | required | — | — | integer | reject | supersession |
| `certificate.maturity` | PR17/18 | required | — | — | enum incl. `IMPLEMENTED_PROVISIONAL` | reject | honesty gate |
| `certificate.verifierId`, `codeId`, `codeVersion` | PR16 | required | — | — | non-empty | reject | regulation provenance |
| `certificate.worstUtilization` | PR15/18 | optional | — | — | `0 < u` | omit | context, **never** re-derived by CAD |

### 4.3 Units and frame

| Field | Owner | Req | Validation | If absent | Purpose |
|---|---|---|---|---|---|
| `units.length` | Stabileo | required | literal `"m"` | reject | no implicit mm |
| `units.angle` | Stabileo | required | literal `"deg"` | reject | arc sweep |
| `coordinateSystem` | Stabileo | required | `{ up: "Z", handedness: "right" }` | reject | prevents Y-up mistakes |
| `origin.translation` | Stabileo | required | `Point3` | reject | handoff frame origin |
| `origin.rotation` | Stabileo | optional | unit quaternion | identity | rotated footings |

> The GLB path is Y-up by glTF convention. The **conversion belongs to the CAD side and must be
> declared in the GLB metadata**, never applied silently to the manifest.

### 4.4 Concrete geometry

| Field | Owner | Req | Unit | Validation | If absent | Purpose |
|---|---|---|---|---|---|---|
| `concrete.footing` | PR18 | required | m | closed solid, positive volume | reject | the primary body |
| `concrete.pedestal` | PR18 | **optional** | m | positive volume if present | omit body | only when modelled |
| `concrete.supportedColumn` | PR17/18 | optional | m | positive volume | omit body | context for dowel checks |
| `concrete.*.bodyId` | Stabileo | required | — | unique, stable | reject | STEP body naming |
| `concrete.*.materialRef` | PR16 | required | — | resolves | reject | provenance, not FEA input |

Each body carries an explicit primitive/extrusion description. **No implicit prisms.**

### 4.5 Reinforcement

One entry per **bar instance**, mirroring `BarPath` so no re-derivation happens:

| Field | Owner | Req | Unit | Space | Validation | If absent | Purpose |
|---|---|---|---|---|---|---|---|
| `bars[].id` | PR17 `BarPath.id` | required | — | — | unique | reject | stable identity |
| `bars[].mark` | PR17 `BarMark` | required | — | — | non-empty | reject | ties an issue to a schedule row |
| `bars[].role` | PR17 `BarRole` | required | — | — | enum | reject | drives which checks apply |
| `bars[].diameterMm` | PR17 | required | **mm** | — | `> 0` | reject | the only mm field; named for it |
| `bars[].materialRef` | PR16 | required | — | — | resolves | reject | provenance |
| `bars[].layerId` | PR17 | required | — | — | e.g. `e184:bottom:0` | reject | grouping + body naming |
| `bars[].ownerElementIds` | PR17 | required | — | — | non-empty | reject | traceability |
| `bars[].cuttingLength` | PR17 | required | m | — | `> 0` | reject | schedule cross-check |
| `bars[].segments[]` | PR17 `BarSegment` | required | m/deg | handoff | ≥1 segment | reject | the centreline |
| `segments[].kind` | PR17 | required | — | — | `straight \| arc` | reject | sweep strategy |
| `segments[].start`, `.end` | PR17 | required | m | handoff | finite | reject | endpoints |
| `segments[].length` | PR17 | required | m | — | `> 0` | reject | validation |
| `segments[].radius`, `.sweepDeg`, `.centre` | PR17 | **required when `kind === 'arc'`** | m/deg/m | handoff | consistent triple | **emit `arcApproximated: true` and degrade to chord — visibly** | exact arcs |
| `bars[].startTreatment`, `.endTreatment` | PR17 | required | — | — | `straight \| hook \| continuous` | reject | ends |
| `...hook` | PR17 `HookGeometry` | **only when `kind === 'hook'`** | m/deg | handoff | established geometry | **omit — never synthesise** | real hooks only |
| `bars[].instanceOf`, `.instanceCount` | PR17 | optional | — | — | `≥ 1` | treat as 1 | repetition without duplication |

`bars[].centre` deserves emphasis: `BarSegment.centre` exists precisely because start/end/radius/
sweep **do not determine a 3-D arc**. Two centres satisfy them in any plane and the plane is free.
Omitting it forces a chord approximation whose deviation is the full sagitta. The manifest
therefore treats a missing `centre` on an arc as a **declared approximation**, never a silent one.

### 4.6 Requirements the CAD side must check against

| Field | Owner | Req | Unit | Validation | If absent | Purpose |
|---|---|---|---|---|---|---|
| `requirements.cover[]` | PR16/17 | required | m | `> 0`, per face/role | reject | cover check target |
| `requirements.clearSpacing[]` | PR17 | required | m | `> 0`, per role pair | reject | spacing check target |
| `requirements.clauseRefs[]` | PR16 | optional | — | code + clause + edition | omit | evidence, reuses existing provenance |

**Stabileo owns these numbers. CAD measures against them and never invents them.**

### 4.7 Honesty fields

| Field | Owner | Req | Purpose |
|---|---|---|---|
| `assumptions[]` | Stabileo | required (may be empty) | e.g. the 20 mm aggregate default when absent |
| `unsupportedConditions[]` | PR17 `UnsupportedCondition` | required (may be empty) | what detailing could not establish |
| `stabileoVerdict` | PR17 | required | Stabileo's own collision/cover result, so CAD is a cross-check with a baseline to agree or disagree with |

### 4.8 Explicitly forbidden

No anchor bolts, no hooks beyond established `BarEndTreatment`, no bend geometry not present in
`BarSegment`, no construction tolerances unless configured, no IFC/BIM semantics, no fabrication
approval, no issued-for-construction status, no re-derived utilisation.

---

## 5. Vertical slice

```
real PR18 footing
  → persisted design + detailing (existing production path, unchanged)
  → RcCadHandoffV1 (new Stabileo exporter, sibling to DXF/XLSX)
  → CAD importer (Stabileo-specific adapter)
  → named solids (concrete bodies + one swept solid per bar)
  → STEP + GLB (cadpy, reusable unchanged)
  → constructibility checks (cross-check against stabileoVerdict)
  → review JSON (RcCadReviewV1)
  → CAD Viewer (inspect, highlight issues)
```

### Identity, stability and traceability

| Concern | Rule |
|---|---|
| Body ID | `concrete:<bodyId>` and `bar:<barId>`; derived from PR17's stable `BarPath.id` and `layerId`, never from array position |
| Issue ID | deterministic hash of `(checkKind, sorted participant IDs, quantised measurement)` — stable across runs, order-independent |
| Traceability | every issue names `barId` + `mark` + `ownerElementIds`, so it resolves to a schedule row and a member in the Stabileo UI |
| Staleness | review JSON echoes all four revisions + `source.gitRevision`; a mismatch marks the review **stale** and it must not be displayed as current |
| Determinism | same input → identical STEP/GLB/review bytes; use cadpy `source_hash`/`file_metadata`; no timestamps inside geometry payloads |

### Checks

| # | Check | Authority | CAD role |
|---|---|---|---|
| 1 | Bar–bar solid intersection | Stabileo `detectCollisions` | independent cross-check |
| 2 | Surface-to-surface clear spacing | Stabileo classification rules | measure vs `requirements.clearSpacing` |
| 3 | Concrete cover distance | Stabileo containment check | measure vs `requirements.cover` |
| 4 | Reinforcement outside the concrete boundary | Stabileo | containment cross-check |
| 5 | Duplicate / coincident bars | CAD | genuinely new — catches manifest/export faults |
| 6 | Dowel / starter interference | Stabileo roles | role-aware pair test |
| 7 | Tie / longitudinal clash | Stabileo roles | role-aware pair test |
| 8 | Unsupported / incomplete geometry blockers | Stabileo `unsupportedConditions` | **blocker, not a pass** — refuse to report clean |

**Disagreement between CAD and `stabileoVerdict` is itself a reportable finding.** That is the
main scientific value of the slice.

### Responsibility boundary

**Stabileo owns** structural design, regulation requirements, required cover and spacing, physical
reinforcement intent, and revision/certificate state. **CAD review owns** geometric realization,
intersection, measured clearances, containment, and visible artifact inspection.
**CAD review must never silently change the Stabileo design** — it returns findings, never edits.

### Fixtures

1. **Clean footing** — from a real PR18 production fixture (`rc-design-qa-8.json` family or its
   footing equivalent). No collisions, cover and spacing satisfied. STEP + GLB generated and
   inspectable in CAD Viewer. Expected: zero issues, and CAD agrees with `stabileoVerdict`.
2. **Intentionally invalid derivative** — a controlled mutation of fixture 1, *not* a hand-built
   model, so the delta is exactly the injected defect:
   - one bar translated to force a **collision**
   - one bar moved outward to force a **cover failure**
   - two bars brought together to force a **clear-spacing failure**
   - deterministic issue IDs, each carrying a measured value and the requirement it violated
   - visible highlighting in the Viewer

### Visible acceptance journey

Generated from the **real Stabileo UI/workflow**, not a test-only hook: design a footing → run
detailing → export the handoff from the export surface alongside DXF/XLSX → invoke the CAD adapter
explicitly → open the GLB/STEP in CAD Viewer with an absolute `?dir=` → inspect the clean fixture
(zero issues) and the invalid one (three highlighted issues) → trace every CAD issue back to a
Stabileo bar / mark / element → confirm EN and ES parity on every Stabileo-side string → confirm
provisional and unsupported states remain visible and are not smoothed into a clean pass.

---

## 6. Architecture choices — for the user to decide

Nothing here is implemented. Each option lists the files it would touch.

### 6.1 Process boundary

| Option | Trade-offs | Licensing | Owner |
|---|---|---|---|
| **A. File + CLI handoff** *(recommended)* | Simplest, debuggable, deterministic, artifacts are the interface. Slower, manual invocation. | **Cleanest** — arm's-length, no code mixing, AGPL/MIT untouched | Stabileo exports; CAD CLI consumes |
| B. Library dependency | Tightest loop. But pulls Python CAD deps into a browser product and creates a real licensing entanglement | Risky | — |
| C. Local service / API | Good UX, live round-trip. Process lifecycle, ports, auth, and a daemon to supervise | Clean if arm's-length | — |

Files: new `web/src/lib/export/rc-cad-handoff.ts` (+ tests); CAD-side CLI under
`skills/cad/scripts/`.

### 6.2 Schema ownership

| Option | Trade-offs |
|---|---|
| **A. Stabileo-owned neutral contract** *(recommended)* | Stabileo owns the semantics it alone can be right about (roles, cover, clauses). Versioned, published as JSON Schema. CAD is a consumer |
| B. Shared schema package | Needs a third home and a release process for a two-consumer contract |
| C. text-to-cad-owned importer contract | Wrong direction — would push CIRSOC semantics into an MIT generic CAD repo |

Files: `web/src/lib/export/rc-cad-handoff.ts`, `docs/poc/rc-footing-cad-review.md` (canonical §4).

### 6.3 Solid-generation ownership

| Option | Trade-offs |
|---|---|
| **A. Split — centrelines in Stabileo, solids in CAD** *(recommended)* | Matches where the knowledge is. Stabileo already owns exact arc centrelines; sweeping a circular profile along a polyline-with-arcs is exactly what OCCT/cadpy is for. No solid modeller in the browser |
| B. Stabileo generates solids | Would need a B-rep kernel in the web app. Disproportionate |
| C. CAD infers geometry | Would require CAD to re-derive bends — the sagitta trap |

Files: CAD-side sweep in `skills/cad/scripts/` using `packages/cadpy` `step_export`/`glb`.

### 6.4 Viewer integration

| Option | Trade-offs |
|---|---|
| **A. External CAD Viewer launch** *(recommended for the POC)* | Zero new UI, uses the documented `serve` entrypoint and absolute `?dir=`. Two apps, manual handoff |
| B. Embedded in Stabileo's Three.js viewport | Best long-term UX; Stabileo already has `Viewport3D`. Significant work, duplicates viewer features |
| C. Linked artifact workflow | Middle ground: Stabileo links to a Viewer URL with `file=` relative to `?dir=` |

Files (B only, later): `web/src/components/Viewport3D.svelte`, `lib/viewport3d/*`.

### 6.5 Collision implementation

| Option | Trade-offs |
|---|---|
| **A. Minimal POC-only checker on the CAD side, cross-checking Stabileo** *(recommended)* | Nothing suitable exists on `develop`. Small, honest, scoped to the eight checks. Its purpose is agreement/disagreement with `stabileoVerdict`, not authority |
| B. Adapt PR #40 | 210 commits behind, maintainer's own branch, and aimed at STEP display edges rather than rebar clearance. Coordination cost with little reuse |
| C. Reuse `develop` | **Not possible** — no general collision/clearance API exists there |
| D. Trust Stabileo only, CAD for artifacts + viewing | Cheapest and loses least; forgoes the cross-validation, which is much of the point |

Files: new CAD-side checker; **no change** to `web/src/lib/engine/detailing/collision.ts`.

### 6.6 Review-result return path

| Option | Trade-offs |
|---|---|
| **A. `RcCadReviewV1` JSON read back by Stabileo, displayed read-only** *(recommended)* | Symmetric with the handoff, revision-stamped, auditable. Stabileo shows findings and never lets CAD mutate the design |
| B. Report/screenshot only | Simplest, but nothing is traceable or machine-checkable |
| C. CAD writes back into the model | **Reject** — violates the responsibility boundary |

Files: `web/src/lib/store/detailing.svelte.ts` (read-only surface), new review reader + tests.

---

## 7. Recommended first increment

Options **6.1-A, 6.2-A, 6.3-A, 6.4-A, 6.5-A, 6.6-A** — file/CLI boundary, Stabileo-owned schema,
split geometry, external Viewer, minimal cross-checking CAD checker, JSON review read back
read-only.

Smallest useful slice: **the exporter and its schema only** — `RcCadHandoffV1` emitted from a real
PR18 footing, with a golden-file test and validation, and no CAD side at all. It is independently
valuable (a stable published contract), it forces the two adapter gaps in §2 to be resolved, and it
carries no dependency, licensing or upstream-coordination risk. The CAD importer follows once the
manifest is real.

**Not started. Awaiting the user's architecture decisions.**
