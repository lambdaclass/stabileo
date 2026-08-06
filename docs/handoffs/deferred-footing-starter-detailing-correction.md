# Deferred: footing starter-cage detailing correction

Recorded 2026-08-01 out of the PR19 CAD-interoperability slice, by decision after the diagnostic
audit of the canonical handoff `rc-footing-cad-poc.handoff.json`
(88 101 bytes, SHA-256 `795e9de26f2eb8ce8d51f2ac7130336702fc534588f390071e3bd40bc03aa0e7`).

PR19 exports what production produces and reports it honestly. It does **not** change any bar
geometry. Everything below is a change to the detailing engine and therefore belongs to a separate
structural correction, sequenced **after PR18**. This document exists so the evidence survives until
that correction begins; no branch and no PR have been opened for it.

Sections are marked **[FACT]** (measured in the current code or the committed manifest),
**[REQUIRED]** (a constraint the correction must satisfy), **[OPEN]** (a genuinely unresolved
engineering decision) or **[DEFERRED]** (deliberately out of scope for now).

Nothing here was found by inspection alone: every number was recomputed from the committed manifest
and independently confirmed by the `text-to-cad` consumer at
`poc/pr19-stabileo-rc-cad` (`4e72739`).

---

## 1. Bottom-cover placement defect

### What the geometry is — [FACT]

The eight Ø16 column dowels of footing `Z1` realise **0.036 m** of clear cover to the footing's
bottom face against a **0.050 m** placement intent. All eight are equal; there is no worst case
among them.

| | |
|---|---|
| Bars | `F1-C1-dowel-0` … `F1-C1-dowel-7`, mark **F2** |
| Family | `family:columnDowel:footing:1:column:1` |
| Diameter / radius | 16 mm / 0.008 m |
| Bend centreline radius | 0.056 m — Tabla 25.3.1, mandrel 6·d_b |
| Minimum centreline z | **−1.156000 m** |
| Bar surface bottom | −1.164 m |
| Footing base | −1.200 m (`foundingElevation`) |
| **Realised clear cover** | **0.036000 m** |
| Governing entity | `segments[0]`, the 192 mm straight hook extension |
| Governing location | the whole straight; the arc is tangent to horizontal at its end and does not dip below |

The CAD consumer measures `0.036000` for all eight, and the value is reproducible **analytically
from the manifest without any geometry kernel**. Footing clipping did not affect it: the hook sits
44 mm inside the pad and the clip boolean succeeded (interior volume 1.36715e-4 m³).

### The arithmetic — [FACT]

`web/src/lib/engine/detailing/floor-design.ts`, `generateDowels`:

```
available = footingThickness − footingCover − 0.05      = 0.500 − 0.050 − 0.050 = 0.400
embedded  = min(ldFooting, available)                   = 0.400   (l_d > available ⇒ hooked)
start.z   = footingTopZ − embedded                      = −0.700 − 0.400 = −1.100
```

`start` is handed to `buildStraightBarWithHooks`, which treats it as the **tangent point** of the
bend and builds the hook *below* it (`codes/cirsoc201/bar-geometry.ts`, leading-hook branch):

```
extStart = start + hookNormal·(r_bend + extension) − axis·r_bend
```

With `axis = +Z`, the hook's horizontal leg therefore lands at `start.z − r_bend`:

```
z(hook leg)      = −1.100 − 0.056 = −1.156
z(bar surface)   = −1.156 − 0.008 = −1.164
clear cover      = −1.164 − (−1.200) = 0.036
```

Closed form:

```
realised_cover = cover + 0.05 − 4·d_b        where 4·d_b = r_bend (3.5·d_b) + d_b/2
               = 0.050 + 0.050 − 0.064 = 0.036 m
deficit        = 4·d_b − 0.05 = 0.014 m
```

### The fixed 0.05 m reserve — [FACT]

The literal `0.05` is the bottom-mat allowance. It appears **unnamed, twice**, and the two copies
must stay in step:

| Site | Use |
|---|---|
| `engine/detailing/floor-design.ts` — `generateDowels` | computes `available` |
| `engine/detailing/run-footing-design.ts` — footing record | recomputes the same expression for the `hooked` flag |

It carries **no allowance for the bend radius or the bar radius**. Because the missing allowance is
`4·d_b`, the sign of the error flips for any bar larger than **Ø12.5 mm**: below that the reserve is
adequate, at Ø16 it is 14 mm short. The defect is therefore **general to the generator**, not
specific to this fixture.

### Why the existing tests did not catch it — [FACT]

- `engine/detailing/__tests__/floor-design.test.ts` — *"never embeds past the footing bottom mat"*
  asserts a bound with **0.2 m of slack**, so it tolerates the hook drop instead of measuring it.
- The same file's *"places dowels inside the column cover envelope"* reads `segments[0].start.x`,
  which for a hooked bar is the **hook tip**, not the bar position. The default fixture
  (`ldFooting: 0.40`, `available: 0.525`) produces **unhooked** dowels, so that case is never
  exercised.

Neither test encodes the current arrangement as intended. There is no test asserting realised cover.

### What the correction must do — [REQUIRED]

1. **Respect required clear cover first.** The hook's lowest surface, not the tangent point, must
   satisfy the cover requirement. The seating expression must be geometry-aware: derive the
   allowance from `r_bend + d_b/2` for a hooked bar rather than from a fixed literal.
2. **Recompute available anchorage afterwards.** Raising the tangent point reduces `embedded` by
   `r_bend + d_b/2` (64 mm at Ø16). The development length must be re-verified against the *new*
   embedment, not the old one.
3. **Block the detail when development is insufficient.** An l_d that no longer fits must produce a
   **structured blocker** — a refusal or unsupported condition with a stable code that the
   constructibility gate and the CAD manifest both see — never a silent shortening.
4. **Do not silently increase footing thickness** to recover the anchorage. If a thicker pad is the
   answer, it must be a stated design change, not a generator side effect.
5. **Do not violate cover to preserve anchorage.** Cover is the hard constraint; anchorage is what
   gets re-derived and, if it fails, reported.
6. Name the reserve and derive it once, so the two copies cannot drift.

---

## 2. Hook-layout collisions

### What the geometry is — [FACT]

**Twelve** prohibited overlaps, all **dowel-to-dowel**, all mark F2 ↔ F2, all in the hook plane at
z ≈ −1.156. No tie is involved in any of them. None is an intentional lap or contact.

`classifyPair` reaches `prohibitedOverlap` by **rule 1** — unconditional interpenetration, tested
before any declared relationship — so the producer's classification is correct and is not an
over-conservative reading.

The CAD consumer independently resolved all twelve and **agreed on every one**:

| Group | Pairs | Producer | CAD | Δ |
|---|---|---|---|---|
| Coincident axes | `d0\|d1`, `d2\|d3` | −0.016 | −0.016000000 | 0 |
| Arc against arc | `d4\|d6`, `d5\|d7` | −0.016 | −0.016000000 | 0 |
| Parallel, 1.17 mm apart in y | the other eight | −0.01483 | −0.014828427 | 1.573e−6 |

Worst delta **0.0016 mm** against the 0.5 mm agreement band. The 1.17 mm offset is the difference
between `seated.corner.halfUp` (0.1348284 — a corner bar seats *inside* the bend) and
`seated.face.halfUp` (0.136 — an intermediate bar lies against the straight leg).

### The rule that produces them — [FACT]

`floor-design.ts`, `generateDowels`:

```
hookNormal = { x: −Math.sign(p.x) || 1, y: 0, z: 0 }
```

Every hook turns along **±x toward the column centre**, whichever face the bar is seated against.
The eight bars sit four to a face:

| Face | x positions |
|---|---|
| y = −0.135 | d0 −0.1348, d4 −0.0816, d6 +0.0272, d1 +0.1348 |
| y = +0.135 | d3 −0.1348, d5 −0.0272, d7 +0.0816, d2 +0.1348 |

Four bars per face, all on one line, all with hooks along ±x of reach
`r_bend + extension = 0.056 + 0.192 = 0.248 m`. C(4,2) × 2 faces = **12**. The count is exact, not
coincidental.

### What was tested, and what it rules out — [FACT]

- **Alternating hook directions alone is insufficient.** The 0.248 m reach exceeds the 0.400 m
  column width with bars at ±0.135. Under any assignment of signs, two hooks collinear on one line
  overlap unless separated by more than 0.248 m; the largest separation available is 0.270 m,
  between the two corner bars only.
- **Rotating each hook to its nearest face's inward normal removes eight of the twelve.** The four
  bars on a face become parallel non-collinear hooks at distinct x, comfortably clear. It does not
  remove the four corner-to-corner overlaps, which remain collinear at x = ±0.1348 with 0.270 m of
  separation against a 0.248 m reach plus bar diameters. The face-normal direction is a pure
  function of `(p.x, p.y, columnB, columnH)`, all of which `DowelInput` already carries, so it is
  deterministically selectable.
- **Staggering hook elevations is potentially sufficient** and is ordinary site practice, but it
  changes which bars bear on the bottom mat and at what level.

### What is not decided — [OPEN]

**No hook-layout rule has been approved.** The correction must choose and justify one of:

- elevation staggering (resolves all twelve; interacts with mat bearing and with §1's cover fix);
- face-normal rotation plus a separate treatment for the four corner bars;
- a shorter anchorage device;
- a combination.

Choosing requires deciding whether hooks at differing elevations still count as *apoyado sobre la
parrilla inferior*, which is an engineering judgement and not a refactor. Anchorage length itself is
unaffected by direction — a 90° hook of 12·d_b is the same piece rotated.

---

## 3. Cover-datum conflation

### What the code does — [FACT]

`DowelInput` declares two distinct covers:

| Field | Meaning |
|---|---|
| `footingCover` | bottom clear cover inside the footing |
| `cover` | the **column's lateral** cover, consumed by `seatedLongitudinalHalfExtents` to place bars in the section |

`engine/detailing/run-footing-design.ts` fills **both from `f.cover`**.

In this fixture that gives a starter cage laid out to **50 mm** lateral column cover while the
column's own detailing uses `DEFAULT_COVER = 0.025` (`engine/design/member-context.ts`) — a **25 mm
lateral mismatch** between the starters and the column bars they lap with. Confirmed in the
manifest: face bars sit at 0.136 from centre, i.e. `0.2 − (0.050 + 0.006 + 0.008)`.

`Footing.cover` is documented in `model/footing.ts` as *"Clear cover to the bottom mat, m"*. It is
consistent with `footingEffectiveDepth`. It says nothing about columns. The UI label
(`footing.ui.cover` → "Recubrimiento (m)") states no reference surface and carries no tooltip.

### What the correction must do — [REQUIRED]

**Separate the datums.** The starter cage's lateral seating must come from the column's own cover,
not from the footing's. Renaming or re-documenting `Footing.cover` does not fix this — the two
numbers are genuinely different quantities and must be sourced separately. Documenting the field is
worth doing as well, but it is not the fix.

This is an independent consequence of the same conflation as §1 and does **not** cause the 36 mm.

---

## 4. Arc nominal-versus-realised consistency

### What the geometry is — [FACT]

38 arcs in the manifest. **26 are exact in every field.** **12 deviate** — precisely the 135° hooks
of the six starter ties (`segments[1]` and `segments[9]` of each).

| Field | Declared | Realised from (start, end, centre) |
|---|---|---|
| `radius` | 0.015 | 0.015074813 (+74.8 µm) |
| `sweepDeg` | 135 | 135.235462 (+0.2355°) |
| `length` | 0.035342917 | 0.035581144 (+238 µm) |
| endpoint radius asymmetry | — | 8.67e−18 m (global worst 5.6e−17) |

Cause: `codes/cirsoc201/transverse-cage.ts` builds the closing hooks with their endpoints at axial
offsets `−gap` and `0` and the centre at `−gap/2`, with `gap = d_s/2 = 0.003`, so the two tails
finish one bar diameter apart. The arc is **planar and exact**, but in a plane inclined to the tie
plane: `R = √(r² + (gap/2)²)`. `arcSegment` computes `length = radius · sweep` from the **nominal
in-plane** values.

The three authoritative fields — `start`, `end`, `centre` — are internally consistent to machine
precision on all 38. This is a **contract ambiguity, not a data defect**.

### Cutting-length consequence — [FACT]

`cuttingLength` sums declared segment lengths, so it understates the realised centreline by
**0.476 mm per tie** (0.238 mm × 2 hooks), 2.9 mm across the six. Negligible in magnitude, but it
means `cuttingLength ≠ realised centreline length`, which is an internal inconsistency rather than a
rounding choice.

### What has been done, and what has not — [FACT] / [DEFERRED]

- **[FACT]** C4 landed in PR19: `description`-only clarification of `radius`, `sweepDeg` and
  `centre` in `rc-cad-handoff.schema.json`. No field renamed, no type changed, no requiredness
  changed, no validation behaviour changed, no manifest byte changed. It states that
  `(start, end, centre)` is authoritative, that `radius` and `sweepDeg` are nominal, that a consumer
  must not reject an internally consistent arc over the nominal difference, and that `sweepDeg` must
  be retained because the point triplet alone does not fix the major/minor branch.
- **[DEFERRED]** Producer-side consistency: deriving `radius`, `sweepDeg` and `length` from the real
  centre. This moves `cuttingLength` for every stirrup in the model and therefore moves the golden
  manifest and the bar schedules. It belongs with this correction, not with C4.
- **[DEFERRED]** Explicit nominal/realised semantics — renamed fields, or realised fields alongside
  the nominal ones, or an authority flag. That is a **V2** conversation and must not be forced into
  V1.
- **[OPEN]** V1 cannot resolve a reflex arc whose nominal sweep sits near 180°, because the
  disambiguating field is itself nominal. No arc in the current producer reaches that case. C4
  documents the limitation; it does not solve it.

---

## 5. Footing-drawing defect

### What the drawings do — [FACT]

`engine/detailing/family-drawings.ts`:

- **Plan.** The horizontal-versus-vertical test is `dxy >= dz`. A hooked dowel has `dxy = 0.248` and
  `dz = 1.595`, so it takes the **circle** branch and is drawn at `pts[0]` — which for a hooked bar
  is the **free tip of the hook**, not the bar. The plan therefore shows eight circles where no
  vertical bar stands, and draws no hook at all. This contradicts the module's own comment, which
  states the intent that *"a hooked dowel whose tail runs horizontally is drawn as the shape it is"*.
- **Section.** The dowels take the polyline branch correctly, so the overlapping hook legs at
  z = −1.156 **are** visible — but as unannotated clutter, with no conflict callout.
- The `rec.` dimension is drawn from the base to `base + cover` at the pad edge. It states the
  intent; nothing dimensions a bar against it.

### Scope — [REQUIRED] / [DEFERRED]

The drawing correction is **separate from the CAD interoperability work** and must not be folded
into it. It may reasonably ride along with this structural correction, since fixing the hook layout
changes what the drawings should show.

---

## 6. Engineering decisions the correction must take — [OPEN]

1. **Acceptable anchorage alternatives** once §1 removes 64 mm of embedment: a larger hook, a
   mechanical anchor, a deeper pad, a smaller bar, or blocking the detail.
2. **Whether the footing must become thicker** — and if so, that it is stated as a design change
   rather than applied silently.
3. **Hook elevation and direction strategy** — see §2 [OPEN]. Nothing is approved.
4. **Interaction with the future footing mat.** PR19 declares
   `FOOTING_MAT_GEOMETRY_NOT_MODELED`; the mats are drawing requirements, not bar geometry. Once
   they become real bars, the hook layout has to clear them, and the 0.05 m reserve becomes a
   measurable quantity rather than an assumption. §1 and §2 should be settled in a way that survives
   that.
5. **Regulatory and constructibility review.** The corrected layout has to be checked against
   §16.3.4 force transfer and §25.4 development, and the constructibility gate must see the new
   blocker from §1 [REQUIRED] 3.

---

## 7. Boundaries — [REQUIRED]

- Sequenced **after PR18**. PR15–PR18 are not to be modified.
- **No hook or cover geometry change belongs in PR19**, whose scope is CAD interoperability.
- **No structural rule may be ported into `text-to-cad`.** The consumer measures and reports; it
  does not classify. The 48 intentional dowel-to-tie contacts stay `NOT_COMPARABLE` there, and the
  interface starter tie stays `UNMEASURABLE`.
- Generalized authoritative cover validation remains separately deferred — see
  `deferred-cover-validation-pr20.md`. That work would *detect* §1 across all element types; it does
  not *fix* it, and neither substitutes for the other.
