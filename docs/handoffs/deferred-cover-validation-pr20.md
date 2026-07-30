# Deferred: generalized authoritative cover validation — probable PR20

Deferred out of PR19 by decision on 2026-07-30. PR19 uses **2-C with 2-A's honesty**: Stabileo
exports the cover requirement it genuinely owns and reports containment as **`NOT_EVALUATED`**; the
CAD side measures achieved cover independently as a **geometric observation**, never a regulatory
verdict.

This document records what would be needed to make cover validation authoritative inside Stabileo.
Sections are marked **[FACT]** (measured in the current code), **[PROPOSED]** (architecture not yet
built) or **[OPEN]** (genuinely unresolved).

## Why this is deferred rather than done — [FACT]

`checkCover` exists in `web/src/lib/engine/detailing/collision.ts:612` and is unit-tested, but it has
**zero production callers**. Every reference in `web/src`:

| Reference | Kind |
|---|---|
| `engine/detailing/collision.ts:612` | its own definition |
| `engine/detailing/__tests__/bar-geometry.test.ts:8, 342, 347, 353, 362, 373` | tests only |

So Stabileo has **no post-hoc geometric containment verdict in production at all** — not for
footings, and not for beams or columns either. Cover is achieved **by construction**, as a placement
input:

```
// engine/detailing/floor-design.ts
footingCover: number;              // Bottom cover in the footing, m
const available = input.footingThickness - input.footingCover - 0.05;
const inset = panel.cover + d / 2 + (layer.direction === 'y' ? d : 0);
```

Bars are *placed* at the correct cover arithmetically. Nothing afterwards measures whether the
realised 3-D geometry sits inside the concrete. That is a defensible design, and it is why wiring a
new authoritative check is a **product-behaviour change** that belongs in its own PR rather than
inside a POC slice.

## What PR20 must consider

### Element types — [FACT] that all six exist in the model

Cover is not one number. The model already carries distinct cover data for:

| Element type | Where cover lives today |
|---|---|
| **Footing** | `model/footing.ts` — `Footing.cover`, plus `floor-design.ts` `footingCover` |
| **Pedestal** | `model/footing.ts` — `Pedestal` (`B`, `L`, `height`) |
| **Slab** | `floor-design.ts` — `panel.cover` |
| **Wall** | `floor-transverse.ts`, `slab-wall-drawings.ts` |
| **Beam** | section `cover` on the design section |
| **Column** | section `cover`, plus `tieDia` affecting effective placement |

A single global scalar would be wrong for all six.

### Surface / face roles — [OPEN]

The current model does **not** distinguish cover by face. A generalized check would have to decide
which surface roles are real for each element type. Candidates that a reinforced-concrete detailer
would expect — **none of which currently exist in the code, and none of which should be invented
here**:

- top, bottom, side, end
- exposed vs. unexposed
- soil-contact (the classic footing case, where the bottom face typically demands more cover than
  the sides)
- formed vs. cast-against-earth
- fire-exposed

**This is the central open question of PR20.** Introducing face roles touches the model, the
detailing placement arithmetic, the regulation lookup, the document/export surface and the UI. It is
not a small addition.

**No regulatory values are proposed here.** The applicable cover values must come from the
regulation via the existing PR16 provenance mechanism (`ClauseRef`, edition-aware lookup), not from
a table written into this document.

### The check itself — [PROPOSED]

`checkCover` currently takes `SectionPrism { halfWidth, halfHeight, origin, axis }` — a prism about
a member axis. **A footing pad is not that shape.** A generalized check needs a containment
abstraction that covers at least:

- a box with `B`, `L`, `thickness` and `rotationDeg` (footing, pedestal)
- a prism about a member axis (beam, column) — already supported
- a bounded plate region (slab, wall)

Whether that is one polymorphic solid abstraction or several per-family checks is **[OPEN]**.

### Arc handling — [FACT], already solved and must be reused

`BarSegment` stores the arc `centre` precisely because start/end/radius/sweep do not determine a
3-D arc. `COLLISION_CHORD_TOLERANCE = 0.0005` m governs sampling. The documented failure this
prevents: a Ø8 stirrup's 90° corner sat **5.9 mm** inboard and a 135° hook **12.3 mm** inboard when
arcs were linearly interpolated — larger than the bars being checked. **Any new containment check
must sample through the same arc-aware path**, or it will reintroduce exactly that error.

### Interaction with the existing collision path — [FACT]

`detectCollisions` is already wired into the floor coordinator (`coordinate-floor.ts`) and produces
`BarConflict { severity, barA, barB, at, clearance, required, shortfall, elementIds }`. A cover
check should produce a comparably structured result — `CoverBreach` already has the right shape
(`barId`, `at`, `actualCover`, `requiredCover`, `elementIds`) — so the two can share reporting,
review and supersession machinery rather than growing a parallel one.

### Risk to existing fixtures — [OPEN]

Wiring a previously-unused check into a mature detailing path may start failing existing production
fixtures. Those failures could be **legitimate** (real defects the check finds) or **spurious** (an
abstraction mismatch). Distinguishing them is part of PR20's work and is a substantial reason it
needs its own review cycle.

## What PR19 does instead — [FACT]

- Exports the cover requirement Stabileo genuinely owns, scoped by element and requirement identity,
  as a **list**, never a global scalar — so PR20 can add per-face requirements without redesigning
  the schema.
- Preserves the existing modelled value rather than hard-coding 50 mm.
- Reports the containment check as `authority: "none"`, `evaluationStatus: "NOT_EVALUATED"` with a
  concrete `notEvaluatedReason`.
- Lets the CAD side measure achieved cover and report it as a geometric observation, explicitly
  **not comparable** to a Stabileo verdict.

## The migration PR20 must be able to make without schema redesign

`RcCadHandoffV1` was shaped so that this transition needs no reinterpretation:

**Today**

```
check: { checkKind: "concreteCover", authority: "none",
         evaluationStatus: "NOT_EVALUATED", notEvaluatedReason: "…" }
cad-review: measured 48.7 mm, status NOT_COMPARABLE
```

**After PR20**

```
check: { checkKind: "concreteCover", authority: "stabileo",
         evaluationStatus: "EVALUATED",
         findings: [ { barIdA, at, measured, required, shortfall } ] }
cad-review: measured 48.7 mm, status AGREEMENT (within the 0.5 mm band)
```

The fields that change are `authority`, `evaluationStatus` and the presence of `findings`. Nothing is
repurposed, nothing is overloaded, and `requirementId` keys stay stable across the transition.

## Open questions for PR20

1. Which surface roles are real for each element type, and where do they live in the model?
2. One polymorphic containment solid, or per-family checks?
3. Does the regulation distinguish cover by exposure in the editions Stabileo already supports, and
   does PR16's provenance mechanism already carry enough to look it up?
4. How are legitimate new failures on existing fixtures triaged and communicated?
5. Does cover validation gate readiness/certification, or report as a warning first?
6. Is editable per-face cover a UI requirement, or is it derived from element and exposure?

**None of these is answered here. PR19 introduces no cover UI and no regulatory cover values.**
