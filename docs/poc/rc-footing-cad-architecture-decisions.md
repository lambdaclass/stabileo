# PR19 architecture decision brief — RC footing CAD constructibility

**Decision packet for the user. Nothing here is implemented or chosen.**

Companions: `docs/poc/rc-footing-cad-review.md` (canonical design record, this repo) and
`docs/poc/stabileo-rc-footing-cad.md` (fork `Batuis/text-to-cad`, branch
`poc/pr19-stabileo-rc-cad`).

## Evidence base

Measured on `pr/19-rc-cad-constructibility` (ancestors PR15 `7d0ab24ef` · PR16 `b13c81ce8` ·
PR17 `86b8b3ace` · PR18 `d19588ef3`) and on text-to-cad `develop` `258236e3c`.

| Fact | Value | Source |
|---|---|---|
| Bar geometry contract | `BarPath` / `BarSegment`, `kind: 'straight' \| 'arc'`, with `radius`, `sweepDeg` **and `centre`** | `web/src/lib/codes/cirsoc201/bar-geometry.ts` |
| Collision sampler chord tolerance | `COLLISION_CHORD_TOLERANCE = 0.0005` m (**0.5 mm**) | `engine/detailing/collision.ts:81` |
| Clearance tolerance default | `DEFAULT_TOLERANCES` — `placement` **zero by default**, deliberately: CIRSOC's minimum clear spacing *is* the requirement, and a hardcoded 10 mm was silently deducted from every measured clearance | `collision.ts:48–54` |
| Broad phase | uniform spatial hash, cell `= max(0.05, 2·maxRadius + requiredClear + placement + 0.02)` m, 27-cell neighbourhood | `collision.ts:415+` |
| Narrow phase epsilon | `EPS = 1e-12` | `collision.ts:300` |
| Documented sagitta error | Ø8 stirrup 90° corner (r = 20 mm) → **5.9 mm**; 135° hook → **12.3 mm**. Both larger than the bars being checked | `bar-geometry.ts:175–178, 409–411` |
| Cover containment | `CoverBreach { barId, at, actualCover, requiredCover, elementIds }` against `SectionPrism { halfWidth, halfHeight, origin, axis }` | `collision.ts:578+` |
| Clear-spacing rule delivery | `detectCollisions(bars, { requiredClearFor, classifyFor, placementFor })` — **caller-supplied callbacks**, deliberately by-name after positional args caused two real defects | `collision.ts:415` |
| Stabileo export formats | DXF **R12 (AC1009)**, XLSX, PNG, JSON — **no STEP, no GLB** | `lib/dxf/writer.ts`, `lib/export/excel.ts` |
| Coordinates | **Z-up, right-handed**; SI, metric only | `docs/adr/0001-z-up-coordinate-system.md` |
| cadpy on develop | `step_export`, `step_scene`, `step_artifact(s)`, `step_metadata`, `step_hash`, `step_targets`, `glb`, `glb_topology`, `glb_mesh_payload`, `stl`, `threemf`, `metadata`, `file_metadata`, `source_hash`, `assembly*`, `render`, `reporting`, `validators` | `packages/cadpy/src/cadpy/` |
| **Collision API on develop** | **none.** Only `models/robots/lyra/lyra_parts/clearance.py` (model-specific) and robot collision *meshes* | `git ls-tree origin/develop` |
| PR #40 | `895ee55`, **210 commits behind** develop, touches `packages/cadjs/src/common/{cadScene,renderEdges,topologyDisplayEdges,displaySettings}.js` — STEP **display edges**, not rebar clearance | fetched PR ref |
| PR #92 | `7328bbe`, 109 behind, `viewer/**`; edits `CadWorkspace.js` which PR #22 also edits — those two already conflict | fetched PR ref |
| Licences | text-to-cad **MIT** (© 2026 earthtojake) · Stabileo **AGPL-3.0** | `LICENSE` in each |
| CAD Viewer launch | `serve` entrypoint, binds **4178** when free and scans forward; requires absolute `?dir=`; read the bound port from its `--json` line | `skills/cad-viewer/SKILL.md`, `AGENTS.md` |

**One item to confirm during implementation, not assumed here:** `SectionPrism` models a
*prismatic member* (half-extents about a member axis). An isolated footing pad is not that shape.
Whether PR18 reuses this containment check for footings, extends it, or uses a separate path is
**not yet verified**. It matters for Decision 5 and is called out there rather than glossed.

---

# Decision 1 — Handoff mechanism

### 1A. Versioned JSON file + CLI

**Data flow:** Stabileo serialises `RcCadHandoffV1` → user saves/downloads it → a cadpy CLI reads
the file → writes STEP + GLB + `cad-review.json` under `models/`.

- **Process/failure boundary:** two independent processes; a CAD crash cannot corrupt Stabileo
  state. Failures are a non-zero exit and a message, inspectable after the fact.
- **Local dev:** run the CLI by hand, diff the JSON, re-run. The manifest is the debugging artifact.
- **Browser constraints:** none beyond a file download — which Stabileo already does for DXF/XLSX/PNG.
- **Reproducibility:** highest. Same JSON → same artifacts, byte-for-byte, with cadpy
  `source_hash`/`file_metadata`.
- **Version compatibility:** explicit `schema` + `schemaVersion`; the CLI refuses unknown majors.
- **Security:** no network surface, no listener. The CLI reads one local file.
- **Licensing:** arm's-length. No linking, no derivative work either direction.
- **Deployment:** Python + cadpy locally. Nothing in the browser bundle.
- **Automation:** a script or agent can run the same CLI in CI later, unchanged.
- **POC effort:** **lowest.** One exporter + one CLI entry point.

### 1B. Shared in-process library

**Data flow:** Stabileo calls CAD code directly in one process.

- Tightest loop, no serialisation. But Stabileo is a **browser** app: OCCT/cadpy is native Python.
  There is no in-process path without a server or WASM port of OCCT.
- **Licensing: the real problem.** Linking MIT code into AGPL is permitted, but the reverse
  coupling makes the boundary arguable, and any Stabileo domain logic reaching the MIT side is
  contamination. Reject on architecture *and* licence grounds.
- **POC effort:** highest, for the least benefit.

### 1C. Local service / API

**Data flow:** Stabileo POSTs the manifest to `127.0.0.1:<port>`; the service returns artifact
paths + review JSON.

- **Boundary:** good — separate process, structured errors.
- **Local dev:** a daemon to start, supervise and diagnose; a port to allocate.
- **Browser:** needs CORS or a same-origin proxy. Real work.
- **Reproducibility:** good, but request/response is a weaker audit trail than files on disk.
- **Security:** an actual listener accepting geometry payloads. Needs bind-to-loopback, size
  limits, and no path traversal from manifest-supplied names.
- **Deployment:** a service to run alongside the dev server — a second thing to keep alive next to
  the port-4000 QA server.
- **Automation:** best long-term for a live in-app round trip.
- **POC effort:** medium-high.

| Option | Visible UX | Stabileo surfaces | text-to-cad surfaces | Dependency cost | Eng. risk | Upstream risk | POC effort | Expansion |
|---|---|---|---|---|---|---|---|---|
| **1A JSON + CLI** | Export button, then run a command | new `lib/export/rc-cad-handoff.ts` + export UI hook | new CLI in `skills/cad/scripts/`, cadpy | low | **low** | none | **~1 phase** | good — same CLI automates |
| 1B library | seamless, in-app | deep coupling | package internals | **high** (native in browser) | **high** | high | 3+ phases | poor |
| 1C service | in-app button, live result | export + fetch client | CLI + HTTP wrapper | medium | medium | low | 2 phases | **best** eventually |

**Recommendation: 1A.** It is the only option whose failure modes are trivial, whose licence
boundary is unarguable, and whose artifacts *are* the audit trail. 1C is the natural successor once
the manifest and checks are proven — and 1A's CLI becomes 1C's handler unchanged, so choosing 1A
now costs nothing later. 1B should be rejected outright.

---

# Decision 2 — Manifest ownership

### 2A. Stabileo-owned `RcCadHandoffV1`

Stabileo owns the schema, versions it, and publishes a JSON Schema next to the exporter.

- **Structural meaning:** Stabileo, unambiguously. It is the only system that knows bar *roles*,
  which regulation edition applies, and what cover a face requires.
- **Required cover/spacing:** defined by Stabileo from PR16 regulations + PR17 rules, emitted as
  data. **CAD measures against them and never derives them.**
- **Evolution:** `schemaVersion` major/minor; consumers refuse unknown majors, ignore unknown
  minors. Stabileo can add fields without breaking the CLI.
- **Shared validation without duplicated domain logic:** ship a **JSON Schema** as the shared
  artifact. It validates *shape* on both sides; the *meaning* stays in Stabileo. The CAD side never
  reimplements a code rule — it reads numbers.
- **MIT/AGPL:** a schema document is data, not code. Publishing it does not relicense anything, and
  the CAD side implements against it without touching AGPL source.
- **Generated types:** JSON Schema → TS types (Stabileo) and → Python dataclasses/`validators.py`
  (cadpy) from the same file. One source, two generated bindings, no hand-sync.
- **Compatibility testing:** golden manifest fixtures committed in Stabileo; the CAD side keeps a
  copy of the same fixtures as its contract tests. Divergence surfaces as a fixture diff.

### 2B. Shared standalone schema package

Neutral third home (npm + PyPI).

- Cleanest in theory. In practice a third repository, a third release cadence and a versioning
  policy — for a **two-consumer** contract. Premature.

### 2C. text-to-cad-owned import contract

- Wrong direction. It would push CIRSOC roles, cover semantics and clause references into a generic
  MIT CAD repo, which the maintainer should refuse and which would make Stabileo a *follower* of a
  schema it alone understands.

| Option | Visible UX | Stabileo surfaces | text-to-cad surfaces | Dependency cost | Eng. risk | Upstream risk | POC effort | Expansion |
|---|---|---|---|---|---|---|---|---|
| **2A Stabileo-owned** | invisible | exporter + JSON Schema + fixtures | generated Python types, `validators.py` | low | **low** | none | ~0.5 phase | good |
| 2B shared package | invisible | consumer | consumer | medium | low | medium | 1.5 phases | good, later |
| 2C t2c-owned | invisible | follower | schema owner | low | **high** | **high** | 1 phase | poor |

**Recommendation: 2A**, with the JSON Schema as the shared artifact and generated bindings on both
sides. Revisit 2B only if a third consumer appears.

---

# Decision 3 — Solid-generation ownership

### 3A. Stabileo generates STEP/GLB directly

- **Arc fidelity:** Stabileo has the exact data (`centre` stored). But it would need a B-rep kernel
  in the browser to *sweep* a profile along an arc polyline. No such thing is in the stack.
- **Named bodies / metadata:** doable.
- **Dependency cost:** very high — OCCT-in-WASM or a hand-rolled mesher. A hand-rolled sweep would
  reintroduce exactly the class of error `bar-geometry.ts` documents.
- **Determinism / testability:** fine in principle.
- **Long-term (beams, joints, slabs, walls):** poor. Joint congestion is where solids matter most
  and where a naive sweeper fails first.

### 3B. cadpy generates all solids, from thinner input

- Requires CAD to *re-derive* bends and hooks from endpoints. That is precisely the sagitta trap:
  start/end/radius/sweep **do not determine a 3-D arc** — two centres satisfy them in any plane,
  and the plane is free. Re-derivation would silently reintroduce 5.9–12.3 mm errors.
- **Reject** as an input contract. (This is *not* the same as 3C, where CAD receives the centre.)

### 3C. Split — Stabileo exports concrete boundaries + `BarPath` intent; cadpy realises solids

- **Arc fidelity:** exact. Stabileo emits `start`, `end`, `radius`, `sweepDeg`, `centre`; cadpy
  builds a true arc edge. No approximation anywhere, and a missing `centre` degrades to a chord
  **with `arcApproximated: true` declared**.
- **Bend/hook fidelity:** hooks come from PR17's `BarEndTreatment`; cadpy emits them only when
  `kind === 'hook'` and **never synthesises** one.
- **Named bodies:** `concrete:<bodyId>` and `bar:<barId>`, derived from PR17's stable ids and
  `layerId`, never array position.
- **Metadata:** cadpy `step_metadata` / `metadata` / `source_hash` / `file_metadata` already exist.
- **Dependency cost:** zero new deps in Stabileo; Python-side OCCT is already how cadpy works.
- **Browser vs Python:** each side does what it can already do.
- **Determinism/testability:** golden STEP/GLB per fixture; hash-compared.
- **Long-term:** best. Beams, joints, slabs and walls are all "more `BarPath`s + more concrete
  bodies" — the contract does not change shape.

| Option | Visible UX | Stabileo surfaces | text-to-cad surfaces | Dependency cost | Eng. risk | Upstream risk | POC effort | Expansion |
|---|---|---|---|---|---|---|---|---|
| 3A Stabileo solids | same artifacts | new B-rep/mesher + exporter | none | **very high** | **high** | none | 3+ phases | poor |
| 3B cadpy from thin input | same artifacts | thin exporter | sweep + **bend re-derivation** | low | **high** (sagitta) | medium | 1.5 phases | poor |
| **3C split** | same artifacts | exporter emitting full `BarPath` | sweep honouring `centre`, cadpy STEP/GLB | **low** | **low** | low | **~1 phase** | **best** |

**Recommendation: 3C.** It puts each half of the problem where the knowledge already is, and it is
the only option that preserves arc fidelity by construction rather than by care.

---

# Decision 4 — Viewer connection

### 4A. External CAD Viewer, launched with exported artifacts

**Journey:** design footing → run detailing → *Export CAD handoff* → run the CLI → it prints a
Viewer URL → open it → inspect solids and issues.

- **Cross-origin/local server:** the Viewer's own `serve` entrypoint, `--host 127.0.0.1`, absolute
  `?dir=`, port read from its `--json` line (4178 when free). No CORS work; Stabileo is not
  involved in serving.
- **Artifact lifetime:** files under `models/`, persistent until deleted.
- **Staleness:** the review JSON carries all four revisions + `source.gitRevision`; a mismatch marks
  it stale. Detection exists; *display* of staleness is manual at this stage.
- **Issue highlighting:** by body name, using the Viewer's existing selection.
- **Complexity:** lowest. Zero new UI.
- **Product quality:** two apps, manual step — a demo, not a feature.
- **First POC demonstrates:** a real PR18 footing as named solids in 3D, and three injected defects
  highlighted and traceable to bar marks.

### 4B. Linked artifact workflow from Stabileo

Stabileo stores the artifact path + Viewer URL (`?dir=` absolute, `file=` relative) and offers an
"Open in CAD Viewer" link beside the export.

- Small, real UX gain; keeps the same boundary. Needs a place to persist the link and a staleness
  badge next to it.
- **Product quality:** meaningfully better — the user never types a command.

### 4C. Embedded CAD Viewer inside Stabileo

- Best UX. Stabileo already has Three.js (`Viewport3D.svelte`, `lib/viewport3d/*`), so a GLB could
  be shown in-app.
- But it duplicates Viewer features (catalog, selection, feedback), and PR #92 shows the upstream
  viewer surface is actively churning — with a live conflict against PR #22 on `CadWorkspace.js`.
  Embedding now means tracking a moving target.

| Option | Visible UX | Stabileo surfaces | text-to-cad surfaces | Dependency cost | Eng. risk | Upstream risk | POC effort | Expansion |
|---|---|---|---|---|---|---|---|---|
| **4A external** | manual, two apps | none | `serve` (documented) | none | **low** | none | **~0** | stepping stone |
| 4B linked | one click out | link persistence + staleness badge | `serve` | low | low | none | ~0.5 phase | **good** |
| 4C embedded | fully in-app | `Viewport3D.svelte`, `viewport3d/*` | GLB only | medium | medium-high | low | 2–3 phases | best eventually |

**Recommendation: 4A for the first POC, 4B immediately after.** 4A proves the pipeline with zero UI
risk; 4B is a cheap, high-value follow-up. 4C is the right end state but should wait until the
manifest, the checks and the upstream viewer surface have all settled.

---

# Decision 5 — Collision and constructibility responsibility

This is the decision that determines whether the POC is honest.

## What Stabileo already does

`engine/detailing/collision.ts` is not a stub:

- **Broad phase:** uniform spatial hash; cell sized `max(0.05, 2·maxRadius + requiredClear +
  placement + 0.02)` m so the 27-cell neighbourhood provably contains every candidate. `O(n·k)` in
  local density, not `O(n²)` — it holds up on a joint with 40 incident bars.
- **Narrow phase:** exact segment-pair tests, `EPS = 1e-12`, squared-gap arithmetic to avoid
  square roots in the hot path.
- **Arc behaviour:** paths are sampled with `COLLISION_CHORD_TOLERANCE = 0.0005` m (**0.5 mm**),
  and the sampler uses the stored `centre`, so arcs are followed rather than chorded.
- **The documented sagitta errors:** before `centre` was stored, linear interpolation put a Ø8
  stirrup's 90° corner **5.9 mm** inboard and a 135° hook **12.3 mm** inboard — *larger than the
  bars being checked*, so every conflict measured at a bend was measured against geometry that
  wasn't there. This is written down in `bar-geometry.ts:175–178`. It is the single strongest reason
  not to hand geometry re-derivation to a second implementation.
- **Clearance default:** `placement` is **zero by default**, deliberately. A hardcoded 10 mm was
  once silently deducted from every measured clearance, so a cage drawn exactly at the code minimum
  failed its own check by that amount, every pair, every model. Projects opt *into* conservatism.
- **Cover containment:** `CoverBreach { barId, at, actualCover, requiredCover, elementIds }` —
  signed, so negative means outside. Catches "a hook turned the wrong way".
- **API discipline:** `detectCollisions(bars, { requiredClearFor, classifyFor, placementFor })` takes
  its rules **by name**, because passing two similar callbacks positionally caused a real defect
  twice.

**Two gaps that bear on this decision:**

1. **Clear spacing is not exported.** `requiredClearFor` is a *caller-supplied callback*. The rule
   lives in the caller, so the manifest cannot state required spacing without a new read-only
   accessor. This is gap #1 of the two in §2 of the design record.
2. **`SectionPrism` is a prismatic-member abstraction** (half-extents about a member axis). An
   isolated footing pad is not that shape. Whether PR18 reuses this containment path for footings,
   extends it, or has its own is **unverified** — it must be checked before relying on Stabileo's
   containment verdict *for footings specifically*. If it turns out footings are not covered, that
   materially strengthens the case for a CAD-side containment check, and it should be resolved
   before the fixtures are frozen.

## Option A — Stabileo-only authority

Stabileo exports its existing collision/cover verdicts; CAD renders geometry and displays those
issues. No independent CAD computation.

- **Achieves "clash-aware RC detail"?** **Yes, visually.** The user sees a real 3-D cage with real
  issues highlighted. What is absent is *independent confirmation*.
- Cheapest, zero false positives, zero divergence to explain.
- Risk: the demo is only as trustworthy as Stabileo already was. It adds visualisation, not
  assurance. If the goal includes "I want to believe the cage", A does not add belief.

## Option B — Stabileo authority + independent CAD cross-check

Stabileo stays authoritative. CAD computes solid intersections and distances from the manifest
solids. Disagreement becomes a review issue. CAD never overrides.

- **Achieves it?** **Yes, and adds the assurance A lacks.** Two implementations, two codebases, one
  manifest. Agreement is evidence; disagreement is a bug in one of them and is worth more than
  either verdict alone.
- **STEP/BRep distance behaviour:** OCCT `BRepExtrema_DistShapeShape` gives true surface-to-surface
  minimum distance on exact geometry — genuinely independent of Stabileo's sampled-segment
  approach, which is what makes the cross-check meaningful rather than a re-run.
- **Numerical tolerances:** the two must be reconciled explicitly or every result disagrees.
  Stabileo samples at 0.5 mm chord tolerance; OCCT works on exact arcs with its own `Precision`
  confusions. **Agreement must be defined with a stated band** (proposal: report a disagreement
  only when the two measurements differ by more than 0.5 mm, i.e. Stabileo's own sampling
  tolerance) — otherwise sub-tolerance noise is reported as conflict.
- **False positives:** the dominant risk. Sources: tolerance mismatch (above); `placement` = 0
  meaning a cage *at* the code minimum has zero margin, so any tiny numeric difference flips a
  verdict; and unit/frame slips (Z-up → Y-up for GLB).
- **False negatives:** low if solids are built from full `BarPath` including `centre`; high if that
  data is ever thinned (which is why 3B is rejected).
- **Performance:** exact BRep distance is far more expensive than a spatial hash. For one footing
  (tens of bars) it is irrelevant. For a whole floor it would need its own broad phase — out of
  scope here, and worth stating rather than discovering.
- **Disagreement representation:** a first-class issue kind, e.g.
  `kind: "cross-check-disagreement"`, carrying both measurements, the requirement, the tolerance
  band, and both participant ids. Never silently resolved toward either side.

### Implementation sources for B

| Source | Assessment |
|---|---|
| **Current develop APIs** | **Not possible for collision** — no general collision/clearance/containment API exists on `develop`. STEP/GLB/metadata/hash *are* there and are reused unchanged |
| **Port/adapt PR #40** | Poor fit. `895ee55` is **210 commits behind**, is the maintainer's own branch, and targets STEP **display edges** (`cadScene`, `renderEdges`, `topologyDisplayEdges`, `displaySettings`) — a rendering concern, not rebar clearance. Adapting it means coordination cost for little reuse. Worth *reading* for conventions; not worth depending on |
| **Narrow OCCT/cadpy cross-check for the manifest solids** *(recommended)* | Small, scoped to the eight checks, operates only on bodies the importer just built. Uses `BRepExtrema_DistShapeShape` for pair distances and containment. No upstream coordination needed |

## Option C — Move collision checks into text-to-cad

Make CAD the authority.

- **Why this weakens things:** it would replace an arc-exact, regulation-aware, tolerance-audited
  checker — one that has already had and fixed the sagitta bug, the 10 mm-deduction bug, and the
  positional-callback bug — with a generic geometric checker that knows nothing about bar roles,
  CIRSOC clear-spacing classification, or which face a cover requirement belongs to.
- **What it would take to be trustworthy:** port the classification rules (CIRSOC-specific, so
  **AGPL-derived** — a licence violation to place in the MIT repo); reproduce the tolerance
  decisions with their rationale; re-verify against the same fixtures; and keep it in step with
  regulation changes. That is a fork of Stabileo's domain logic into a repository that should not
  contain it.
- **Verdict: reject.** Not because CAD is bad at geometry, but because the authority question is a
  *domain* question, and the domain lives in Stabileo.

| Option | Visible UX | Stabileo surfaces | text-to-cad surfaces | Dependency cost | Eng. risk | Upstream risk | POC effort | Expansion |
|---|---|---|---|---|---|---|---|---|
| A Stabileo-only | 3-D cage + Stabileo issues | export verdicts | render only | **none** | **very low** | none | ~0.5 phase | low |
| **B authority + cross-check** | as A, plus agreement/disagreement | export verdicts + **clear-spacing accessor** | new narrow OCCT checker | low | **medium** (tolerances) | low | **~1.5 phases** | **high** |
| C CAD authority | 3-D cage + CAD issues | export raw geometry | full rule port | medium | **high** | **high** (AGPL into MIT) | 3+ phases | negative |

**Recommendation: B**, implemented as the narrow OCCT/cadpy cross-check, with the agreement
tolerance stated explicitly (0.5 mm, matching Stabileo's sampler) and disagreement modelled as its
own issue kind. B is the only option that makes the POC *evidence* rather than *illustration*, and
it is the only one whose main risk (tolerance noise) is fully controllable by a documented band.

The user's "clash-aware RC detail" experience is achieved under **both A and B**; only B adds
independent confirmation, and only C puts the design at risk.

---

# Decision 6 — Review-result return path

### 6A. Downloadable `cad-review.json` only

- **Stable issue identity:** yes — deterministic hash of `(checkKind, sorted participant ids,
  quantised measurement)`, order-independent.
- **Hashes:** source + artifact hashes via cadpy `source_hash`/`file_metadata`.
- **Revision stamps:** all four revisions + `source.gitRevision` echoed.
- **Stale detection:** possible by comparing stamps — but the *user* must do it.
- **Review/supersession:** none. Nothing in Stabileo knows the review exists.
- **Security:** none needed; a file.
- **Reproducibility:** best.
- **Workflow:** manual, and findings live outside the product.
- **Automation:** good — machine-readable already.

### 6B. Explicit import into Stabileo as a persisted review record

- Everything in 6A, plus: Stabileo stores the review beside the family record, shows issues against
  bar marks, and **marks the review stale automatically** when any of the four revisions or the git
  revision moves. Fits PR17's existing review/supersession model rather than inventing one.
- **Security:** the importer parses an external file → validate against the schema, bound sizes,
  never execute anything, treat all ids as opaque strings, and never let a manifest-supplied name
  become a filesystem path.
- **Read-only by construction:** the review may annotate, never mutate design or detailing. This is
  the responsibility boundary made structural.
- Cost: a persisted record type, a store surface, and UI to show it.

### 6C. Live callback / service integration

- Best UX; requires Decision 1C. Adds a listener, auth-on-loopback and lifecycle concerns. Premature
  before the manifest and checks are proven.

| Option | Visible UX | Stabileo surfaces | text-to-cad surfaces | Dependency cost | Eng. risk | Upstream risk | POC effort | Expansion |
|---|---|---|---|---|---|---|---|---|
| **6A JSON only** | a file the user opens | none | review writer | none | **very low** | none | **~0.3 phase** | stepping stone |
| 6B persisted import | issues in-app, auto-stale | review record + importer + store + UI | review writer | low | medium | none | 1.5 phases | **best** |
| 6C live service | instant in-app | fetch client | HTTP handler | medium | medium-high | low | 2+ phases | best long-term |

**Recommendation: 6A for the POC, 6B as the production version.** 6A's file *is* 6B's import
payload, so nothing is thrown away. 6C only after 1C.

---

# Bundles

## Bundle A — conservative demonstrator

**Scope:** `RcCadHandoffV1` exporter (Decision 2A) + cadpy importer producing named STEP/GLB
(3C) + external Viewer (4A). Collision = **Stabileo verdicts exported and displayed** (5A). Review
= none, or a trivially embedded issue list.

- **User sees:** their real PR18 footing as named solids in 3-D, with Stabileo's own collision and
  cover issues highlighted on the right bars.
- **Deferred:** independent checking, review persistence, invalid fixture, staleness UI.
- **Phases:** 1 — exporter + importer + one fixture.
- **Repos:** Stabileo (exporter), fork (importer CLI).
- **Tests:** schema golden fixture; STEP/GLB hash goldens; a smoke test that every bar id appears
  as a named body.
- **Risk:** very low. **Upstream risk:** none.
- **Honest limitation:** adds visualisation, not assurance.

## Bundle B — clash-aware vertical slice *(recommended)*

**Scope:** real PR18 footing → `RcCadHandoffV1` → named STEP/GLB → external/linked Viewer (4A→4B)
→ **independent OCCT cross-check** (5B) → `cad-review.json` (6A) → clean **and** invalid fixtures.

- **User sees:** the real cage in 3-D; on the clean fixture, zero issues **and an explicit statement
  that CAD and Stabileo agree**; on the invalid derivative, three injected defects (collision,
  cover, spacing) highlighted, each traceable to a bar mark and element, each with a measured value
  and the requirement it violated.
- **Deferred:** persisted review records, embedded viewer, member families beyond the footing,
  whole-floor performance.
- **Phases:** (1) exporter + JSON Schema + clear-spacing accessor; (2) importer + solids + STEP/GLB;
  (3) cross-check + review JSON + both fixtures + tolerance band.
- **Repos:** Stabileo (exporter, accessor, fixtures), fork (importer, checker, CLI).
- **Tests:** schema goldens; artifact hash goldens; per-check unit tests; **two end-to-end
  fixtures**; an explicit agreement test asserting CAD and Stabileo concur within 0.5 mm on the
  clean fixture; a disagreement test that injects a known tolerance breach and asserts it is
  reported as `cross-check-disagreement` rather than resolved.
- **Risk:** medium, concentrated entirely in tolerance reconciliation — controllable by the stated
  band. **Upstream risk:** low; nothing is proposed upstream yet.
- **Why recommended:** it is the smallest scope that produces *evidence* rather than a picture,
  it resolves both known gaps, and every artifact it creates is reused by Bundle C.

## Bundle C — integrated product direction

**Scope:** persisted CAD review records (6B), embedded or deeply linked viewer (4B→4C), round-trip
revision/staleness, and member families beyond the footing (beams, joints, slabs, walls).

- **User sees:** CAD findings inside Stabileo beside the family record, auto-marked stale when the
  design moves, with a 3-D view in-app.
- **Deferred:** live service (1C) unless separately chosen.
- **Phases:** (4) persisted review + importer + UI; (5) staleness/supersession wiring; (6) viewer
  embedding; (7) additional member families.
- **Repos:** mostly Stabileo; fork gains breadth per family.
- **Tests:** everything in B, plus persistence/supersession tests, staleness matrix, and per-family
  fixtures.
- **Risk:** medium-high, mostly product surface and upstream viewer churn (PR #92 ↔ PR #22 already
  conflict on `CadWorkspace.js`).
- **Only sensible after B.**

**Recommended: Bundle B.** Not chosen — the user decides.

---

# Explicit answers

**1. Can Bundle B be implemented without PR #22 or Netgen/NGSolve?**
**Yes, entirely.** Nothing in B touches modal FEA. The solid work uses cadpy's existing
STEP/GLB/metadata modules on `develop`; the cross-check needs OCCT B-rep distance, which is the
same OCCT that cadpy's STEP support already relies on — not NGSolve, and not a mesher. No new
heavyweight dependency and no dependency on PR #22.

**2. Can it avoid copying AGPL code into the MIT repository?**
**Yes**, if the boundary is kept as designed: Stabileo emits **numbers** (required cover, required
clear spacing) and CAD *measures against them*. No CIRSOC rule, classification table, or Stabileo
source crosses over. The shared artifact is a JSON Schema — data, not code. The failure mode to
avoid is porting `requiredClearFor`'s logic upstream; export its *output* instead.

**3. Can the first footing use only production PR18 data?**
**Yes.** Every datum in the manifest maps to an existing production owner — §2 of the design record
traces all 27 to file and type. Footing geometry (`model/footing.ts`), ground conditions
(`model/geotechnical.ts`), `BarPath`/`BarSegment` with stored arc centres, `BarMark`, roles,
`layerId`, `ownerElementIds`, `cuttingLength`, family records and certificates all exist. No
duplicate footing or reinforcement model is needed. The clean fixture should be a real PR18
production fixture, and the invalid one a **controlled mutation of it** so the delta is exactly the
injected defect.

**4. Which two currently missing adapters/accessors must be added?**
1. **A read-only required-clear-spacing accessor.** `detectCollisions` receives
   `requiredClearFor`/`placementFor` as caller-supplied callbacks, so the numbers are never
   materialised. The manifest needs them as data, per bar pair or per role pair. The rules stay
   where they are; only their output is exposed.
2. **A STEP/GLB writer** — which is precisely what the CAD side supplies. Stabileo emits DXF R12
   (2D) only; this is the real capability gap and the reason the CAD side exists in this POC.

*Plus one item to verify, not yet an adapter:* whether PR18's footing path is covered by
`SectionPrism`-based containment, which models a prismatic member and not a footing pad. Resolve
before freezing fixtures.

**5. What would make the POC honest enough to mature into review-ready PR19?**
- Generated from the **real UI/workflow**, never a test-only hook.
- The **clean fixture is a real PR18 production fixture**; the invalid one is a controlled mutation.
- `IMPLEMENTED_PROVISIONAL` maturity, `assumptions[]` and `unsupportedConditions[]` are surfaced,
  not smoothed into a clean pass. An `unsupportedConditions` entry is a **blocker**, never a pass.
- **Stabileo remains the authority**; CAD annotates and never mutates.
- The agreement tolerance is **stated** (0.5 mm) and disagreement is a first-class issue kind.
- Deterministic: identical input → identical STEP/GLB/review bytes; no timestamps in geometry.
- Every issue traceable to a bar id, mark and owning elements.
- **EN/ES parity** on every Stabileo-side string, reusing PR16's structured messages rather than
  inventing text.
- No invented anchor bolts, hooks, tolerances, BIM semantics, fabrication approval or
  issued-for-construction status.
- Gates unchanged: typecheck 490/490, full Vitest, production build, full Playwright.

**6. Which portions could later become a coherent upstream text-to-cad contribution?**
- A **generic, rebar-agnostic solid-clearance utility** — pairwise minimum distance and containment
  over named STEP bodies, with no CIRSOC or Stabileo concepts. This is the strongest candidate and
  is genuinely missing from `develop`.
- **Named-body + metadata conventions** for multi-body engineering assemblies, if they generalise
  beyond this manifest.
- Possibly **Viewer issue-highlighting by body name**, which overlaps PR #92's territory and would
  need coordination with that author.
- **Never upstream:** the `RcCadHandoffV1` importer, bar roles, cover/spacing rules, CIRSOC clause
  references, issue taxonomies.

---

**No production code, no CAD artifacts, no new dependencies, no QA or server changes.**
