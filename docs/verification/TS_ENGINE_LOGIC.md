# Engineering logic in TypeScript

`web/src/lib/engine` holds ~333 non-test TypeScript modules (~108k lines). The Rust engine
(`engine/`) is where the verification lives: certificates, Lean, Kani, fuzzing, mutation
testing. Anything that computes an engineering result in TypeScript sits outside that
verification. This document lists every module, says which class it is in, and records the
plan and its status for bringing the safety-relevant TypeScript under verification.

Classes:

- **(a) delegates to WASM.** The number comes from a Rust/WASM call (`wasm-solver.ts`, a
  `*-kernel.ts` registry). This is the target pattern (`design/other-codes/steel-codes.ts`,
  `cfs-code.ts`, `codes/argentina/rc-section-kernel.ts`).
- **(b) duplicates a Rust check.** The same quantity is computed in TypeScript and in
  `engine/src`. Two implementations of one rule drift apart. These get differential tests
  first, then migrate.
- **(c) TypeScript-only engineering arithmetic.** Loads, code coefficients, capacities,
  model transforms with no Rust counterpart. These get property tests and mutation testing,
  and the load generators are migration candidates later.
- **(d) search/presentation.** Candidate search, orchestration, drawings, SVG, reports,
  types. Whatever they produce is checked again by (a), (b) or (c), and the re-check gate
  below makes sure the engine has the final word on a pass.

## Summary

| Class | Modules | Lines |
|---|---:|---:|
| (a) delegates to WASM | 22 | 10 120 |
| (b) duplicates a Rust check | 61 | 27 115 |
| (c) TypeScript-only engineering arithmetic | 102 | 32 505 |
| (d) search/presentation | 148 | 41 796 |
| **Total** | **333** | **111 536** |

Of the 61 duplicates, 18 are the step-by-step teaching solvers (`steps/*`, `force-method/*`,
`solver-detailed*.ts`). They re-derive a solve the student sees next to the engine's own and
never feed a design. The safety-relevant duplicates are the CIRSOC 201 family
(`cirsoc201*.ts`, `interaction-diagram.ts`, `station-design-forces.ts`), `cirsoc301.ts`,
`serviceability.ts`, the footing family (`foundation-check.ts`, `footing-actions.ts`,
`punching-shear.ts`), the result post-processing with a silent TypeScript fallback
(`section-stress*.ts`, `shell-combos.ts`, `combination-methods.ts`, `diagrams*.ts`,
`station-forces.ts`), and `spectral-case.ts` / `loads/seismic-modal.ts` (SRSS/CQC).

## Findings from the inventory

These came from reading the modules. Each one is either fixed on this branch or listed
under "What is left".

1. **CIRSOC 301 steel is only ever checked in TypeScript.** `verification-service.ts` runs
   `codes/argentina/cirsoc301.ts`, and so does `steel/profile-optimise.ts`. No Rust checker
   implements CIRSOC 301. The Rust `steel_check.rs` is AISC 360, a different code with
   different factors (φc = 0,90 against 0,85; no 1,5·My cap on Mp; 1,6·My weak-axis cap
   against 1,5).
2. **Three WASM checkers had no callers.** `checkCirsoc201Members`,
   `checkServiceability` and `checkSpreadFootings` are wrapped in `wasm-solver.ts`, and no
   app code calls them. The app runs the TypeScript duplicates instead.
3. **The WASM design-check wrappers swallowed errors.** `wasm-solver.ts` (`checkSteelMembers`
   … `checkSpreadFootings`) turned every exception into `null`. Callers have to treat `null`
   as "not checked", never as a pass. `design/other-codes/run.ts` does that. A new caller
   must do the same.
4. **The station extraction falls back to JS without saying so.** `verification-service.ts`
   `computeStationDemands` uses the JS `extractElementStations` when WASM is not ready.
5. **The Rust CIRSOC 201 check does not follow CIRSOC 201.** `cirsoc201_check.rs` used
   Vc = 0,17·√f'c·bw·d whether or not stirrups are present. For a beam below Av,min,
   CIRSOC 201-2025 Tabla 22.5.5.1(c) gives 0,66·λs·ρw^⅓·√f'c, which is about 30 % lower for
   an ordinary beam. It also fixed εty = 0,002 for every fy (21.2.2.1 permits that only for
   fy = 420 MPa), and its compression-steel branch ignored strain compatibility.
6. **φ in the TypeScript verifier uses the 2005 tension-controlled limit.**
   `station-design-forces.ts` `computeFlexureCapacity` and `cirsoc201-basis.ts`
   `phiFromStrain` use εt = 0,005. CIRSOC 201-2025 Tabla 21.2.2 uses εty + 0,003. At
   fy = 420 MPa the TypeScript ramp stays below the permitted εty = 0,002 ramp, so it is
   conservative. At fy = 500 MPa it overstates φ by up to 5 %.
7. **auto-verify gave tension members compression credit in shear.** `auto-verify.ts`
   passes `Nu = max(|N compression|, |N tension|)` to `verifyElement`, whose convention is
   "+ = compression". A member in tension got the compression term (1 + Nu/(14·Ag)) on Vc.
8. **"warn" meant different things.** In CIRSOC 201 a warn is 0,9 < ratio ≤ 1,0, still a
   pass. In `cirsoc301.ts` a warn was 1,00 < ratio ≤ 1,05, and in
   `design-check-results.ts` (`ratioToStatus`, used for every WASM checker) it was
   1,0 < ratio ≤ 1,1. Those members fail the code and were shown in amber.
9. **The crack-width estimate used the inch-pound coefficient.** `serviceability.ts`
   `checkCrackWidth` (only the report uses it) computed Gergely–Lutz with 0,076 and SI
   inputs. The SI coefficient is 0,011, so it reported cracks 6,9 times too wide.
10. **`spectral-case.ts` duplicates SRSS/CQC** from `solver/spectral.rs`.

11. **Silent TypeScript fallbacks replace Rust post-processing.** `section-stress.ts` and
    `section-stress-3d.ts` switch to a full TypeScript implementation when WASM is not
    ready. `shell-combos.ts` recombines shells in TypeScript when the kernel is not
    registered. Neither says so.
12. **`plastic-collapse.ts` reads a solver error as a mechanism.** Any exception from
    `solve()` or the kinematic check is recorded as collapse, so an error comes out as a
    collapse factor.
13. **The PRO report designs slab steel from invented loads.** `pro-report.ts` calls
    `designSlabReinforcement` (`reinforcement-svg.ts`) with q = 10 kN/m², Mu = qL²/10 and
    0,8·Mu for the other direction, whatever the analysis says.
14. **`pdelta-forces.ts` patches the engine's P-Delta member forces.** It adds Kg·u in
    TypeScript because the engine reports K·u only. The fix belongs in Rust.
15. **The provided-reinforcement verifier never checks beam ductility.** CIRSOC 201-2025
    9.3.3.1 requires a beam with Pu < 0,10·f'c·Ag to be tension-controlled
    (εt ≥ εty + 0,003). The 2005 edition (10.3.5) requires εt ≥ 0,004. An over-reinforced
    beam passed with a reduced φ.
16. **Shear steel used fy above 420 MPa.** CIRSOC 201-2025 22.5.3.3 (with its commentary)
    limits the fy and fyt used for Vs to 420 MPa (2005: 11.5.2). `computeShearCapacity` used
    fy as given, so a 500 MPa stirrup was credited 19 % more.
17. **The beam flexure check ignores axial force** (`verifyProvidedReinforcement`, beam
    regions). A beam in tension (a tie, a rafter) is checked as if pure flexure.

18. **The 3D engine halved a tube's shear stress.** `section_stress_3d.rs` paired the one-sided
    `Q = t·(R² − y²)` with the two-sided width 2t, so a CHS peaked at V/A instead of 2V/A, for
    Vz and Vy. The 2D engine had been fixed for exactly this, the 3D one not. Found by the
    engine/oracle differential test once the TypeScript fallback became an oracle (#321).
19. **The 3D engine reported no torsional shear for a rectangle.** It took the Saint-Venant
    thickness as max(tw, tf, t), which is 0 for a solid rectangle resolved by the app. Now
    min(b, h), the conservative statement the TypeScript used. Found the same way (#321).
20. **Numbers crossed the JSON boundary off by an ulp.** `serde_json` without `float_roundtrip`
    parses some decimals one ulp away and subnormals as 0. Every JSON entry point of the engine
    was affected. The feature is now on (#321).

**Status.**

- Fixed on this branch: 5, 6, 7, 8, 9, 12, 13, 15 and 16.
- Fixed on refactor/concrete-in-engine: 17 (beam flexure with axial force, in the engine's beam
  check and so in the verifier, the legacy designer and the gate), and 6 for every CIRSOC 201
  section (φ, the axial caps and the ductility floor now come from the engine for the edition
  asked; see "CIRSOC 201 sections" below).
- Fixed in part:
  - 2: the app now calls `checkServiceability`. The CIRSOC 201 checker is reached through its
    numeric batch, and the JSON entry point is covered by tests.
  - 3: the design-results normaliser now honours the engine's `pass: false` and
    `unevaluated`. The wrappers themselves still return `null` on error, and every new caller
    treats `null` as "not verified".
- Fixed on feat/cirsoc301-rust: 1 (CIRSOC 301 in the engine, the TypeScript an adapter, every
  steel pass gated on the certified engine check; see "CIRSOC 301" below).
- Fixed on fix/ts-silent-fallbacks (#321): 3 (the wrappers throw), 4, 11, 14, 18, 19 and 20 (see "Silent
  fallbacks" below). 14 had already been fixed in #283: the engine reports (K + Kg)·u − FEF and
  `pdelta-forces.ts` is gone; `pdelta-amplification.ts` only reads B2 from the two sets of
  displacements and patches no force.
- Open: 10. See "What is left". (17 is fixed here: the beam check takes the axial force.)

## Plan and status

Each section below is filled in as the work lands. The
PR body holds the live checklist.

### 1. Inventory: done (this file)

### 2. Differential tests, TypeScript against Rust

Tests live in `web/src/lib/engine/__tests__/differential/` and use `fast-check`.

**CIRSOC 201 beam sections** (`cirsoc201-beam.test.ts`). First the Rust checker
(`cirsoc201_check.rs`) was rewritten so that it follows the clause (finding 5): both editions,
strain compatibility, Tabla 21.2.2, 9.3.3.1, Tabla 22.5.5.1 with λs, and the caps of
22.5.1.2, 22.5.3.1 and 22.5.3.3. The Rust tests in `engine/tests/integration/cirsoc201_check.rs`
pin each clause. Then the TypeScript verifier (`station-design-forces.ts`
`computeFlexureCapacity` and `computeShearCapacity`) was run against it on 4 000 random,
physically valid sections:

| Disagreement | Cases | Size | Which side was wrong |
|---|---:|---|---|
| The tension steel was assumed to yield (εt < εy) | 641 | φMn up to 18 % too high | TypeScript (22.2, strain compatibility) |
| φ reached 0,90 at εt = 0,005 whatever fy | 419 | φ up to 2,7 % too high | TypeScript (Tabla 21.2.2: εty + 0,003) |
| Stirrups credited above 420 MPa | 1 335 | Vs up to 19 % too high | TypeScript (22.5.3.3) |
| No ductility check | 1 075 fail 9.3.3.1 | — | TypeScript: the check was missing |
| A compression bar between the stress block and the neutral axis was charged for concrete it does not displace | a few | φMn ~1 % too low | TypeScript (conservative) |
| Av,min computed with fyt capped at 420 MPa | 3 | Vc too high (row (c) beat row (a)) | Rust; fixed: 22.5.3.3 caps fyt in Vs only |

Every TypeScript-side disagreement was unconservative except the last-but-one. All were fixed
by moving the verdict into the engine (step 4). The test now holds an independent TypeScript
statement of the clause, written from the text and not from the Rust. It checks that the
engine agrees with it on 5 000 sections in both editions (φMn to 1e-7 relative, φVn to 1e-12),
that the numeric batch and the JSON checker are the same function, and it pins each of the
four disagreements.

**Serviceability** (`serviceability.test.ts`). On 3 000 random members `checkDeflection` and
the engine's `check_serviceability` gave the same allowable deflection, ratio and verdict.
Cantilevers were included, with the limit taken over 2L. The verdict now comes from the
engine (step 4).

**Footing shear** (`footing-shear.test.ts`). On 2 000 centred footings, with f'c up to 80 MPa
to exercise the √f'c cap, punching and one-way shear disagreed on every footing deeper than
250 mm. The Rust side was wrong:

- punching was taken without λs (Tabla 22.6.5.2 with 22.5.5.1.3), 25 % too strong at
  d = 525 mm;
- one-way shear used 0,17·√f'c. That is row (a) of Tabla 22.5.5.1, which needs stirrups. A
  footing has none, so row (c) applies, with λs and ρw.

Fixed in `foundation_check.rs`. ρw is a new optional input, and 0,0018 is used when it is not
given. Regression tests were added in `engine/tests/integration/foundation_check.rs`. The two
sides now agree to 1e-9. Bearing is deliberately not compared: the engine uses Meyerhof's
effective area and the app a linear pressure. Nor are moments, or the engine's single axial
force used for both service and factored checks (see "What is left").

**Station design forces** (`station-forces.test.ts`). On the QA-8 frame, the TypeScript
fallback `extractElementStations` and the engine's station buffer agree at every common
station. The engine path misses no governing demand the TypeScript finds.

**CQC.** `loads/seismic-modal.ts` `cqcRho` was checked against `solver/spectral.rs`
`combine_cqc` by reading the code. The Der Kiureghian formula is the same, and it is
symmetric in r ↔ 1/r, so the two orderings agree. It was not compared numerically: the engine
exports no correlation entry point, and `spectral-case.ts` builds the case differently from
`solve_spectral_3d`.

**CIRSOC 301** (`cirsoc301-steel.test.ts`). The engine now has its own CIRSOC 301 checker,
`engine/src/postprocess/cirsoc301_check.rs` (the AISC 360 `steel_check.rs` is a different code
and was not used). The TypeScript checker as it stood after #293, #295 and #303 is kept as the
oracle (`__tests__/differential/cirsoc301-oracle.ts`). On 4 000 random members of every family it
knows (I rolled and welded, channels, tees, boxes, RHS, CHS, solid bars; with and without J/Cw,
Cb, load height, K factors and every kind of end connection), with random axial force, both
moments and shear, every check agrees to 1e-9 in design strength and ratio and in verdict and
refusal, and the test asserts that every clause path ran with both verdicts (D.2(a)/(b), E.3,
E.4, E.7, F.2–F.6, G.2, H.1.1a/b and the refusals). One class of disagreement:

| Disagreement | Cases | Which side was wrong |
|---|---:|---|
| Biaxial bending without axial force: no interaction check | 496 of 4 000 | TypeScript. H.1.1, last paragraph: «Para miembros sometidos a flexión biaxial se aplicará la expresión (H.1.1b) anulando el término que contiene a la fuerza axil». A member at 0,63 of φMnx and 0,63 of φMny passed; H.1.1b gives 1,27. Pinned. |

The certified check (`certify_cirsoc301_members`) is run on 1 500 more members: its enclosure
contains the f64 ratio, and it is uncertified only where the f64 check refused a loaded check.

**CIRSOC 201 sections, diagrams, slabs and the legacy designer**
(`cirsoc201-section.test.ts`, `cirsoc201-legacy-designer.test.ts`, `cirsoc201-beam.test.ts`).
The TypeScript each module ran before is kept verbatim in `__tests__/differential/oracle/` (no
production import; `concrete-oracles-are-test-only.test.ts` enforces it).

- Section engine against the TypeScript section engine: 16 000 states on 4 000 random sections
  (rectangles, hollow rectangles, T, circles, rings; 0–16 bars; ties or spiral; with and without
  the displaced-concrete deduction; any axis and depth), 500 sampled curves, 150 biaxial load
  contours and 300 sets of characteristic points agree to 1e-9 (2005, the oracle's edition).
  The 2025 φ and caps, which the oracle never had, are pinned against Tabla 21.2.2 and
  22.4.2.1 on 2 000 more states.
- Rectangular and flanged capacity agree to 1e-8 on 2 000 sections.
- The beam check now takes flanges and the axial force; the clause oracle in
  `cirsoc201-beam.test.ts` was extended to both and agrees on 5 000 sections.

| Disagreement | Size | Which side was wrong |
|---|---|---|
| Circles were inscribed 360-gons | 0,005 % of area, extreme fibre short off the vertices | TypeScript (conservative); the engine integrates the circle exactly (r²·acos(t/r) − t·√(r² − t²)) |
| Interaction diagram: compression bars not net of the concrete they displace | 14,7 kN at the balanced point of a 30×30 (3 %) | TypeScript, unconservative (Po itself deducts it, 22.4.2.2) |
| Interaction diagram: φ from \|εs\| of the tension layer when it is compressed | φ up to ~0,72 instead of 0,65 for c between d and ~1,4·d | TypeScript, unconservative (Tabla 21.2.2: no bar in tension → compression-controlled) |
| Circular/rectangular column ray read by linear interpolation between samples; pure moment at the nose | ratio within 6 % on the ray, on either side (where φ changes along the curve the chord lies outside it: unconservative); pure moment overstated | TypeScript; the engine solves the crossing |
| Legacy designer: its own "passing" beams failed the engine's check of the bars it chose | 129 (2005) / 142 (2025) of 2 000 on strength (d taken for Ø16 whatever bar it chose, A's assumed to yield); 77 / 133 on ductility (εt of the bars provided never checked) | TypeScript, unconservative; the engine-sized designer passes its own bars in every case |
| Legacy column check: "As for M + ½ As for N", straight-line interaction, Nu as a magnitude | light in some of 300 random demands; a column in 1 000 kN of tension "passed" as compressed | TypeScript, unconservative |
| Station verifier biaxial: Bresler with φPnx = Nu·φMn/Mu | not Bresler's capacity at the eccentricity | TypeScript; replaced by the load contour |
| Slabs: ρmax substituted for a slab too thin for its moment; capacity with fy and the φ of the required steel | a 12 cm slab under 200 kN·m/m was "designed" | TypeScript; the engine refuses it |

### 3. Engine re-check gate

There are two production paths to a CIRSOC 201 "pass".

- **Provided reinforcement and candidate search** (`verifyProvidedReinforcement`, used by
  `design/adapters/cirsoc201-adapter.ts` and so by every candidate the search certifies).
  Beam flexure, shear and ductility now come from the engine (step 4). Column axial force
  with moment already came from the Rust column kernel. When the beam kernel is not loaded,
  the verifier reports the member as not verifiable: the capacity is `null`, or φVn = 0,
  which fails.
- - **CIRSOC 301 steel** (`codes/argentina/cirsoc301-engine-gate.ts`). `checkSteelMember` — the one
  path of the verification, the profile optimiser, the tension table and the steel results
  screen — hands the exact input it checked and every demand set (the compression and the
  tension run) to `certify_cirsoc301_members`. A pass stands only when the certified utilization
  is provably below 1; otherwise the member fails with `VERIF_ENGINE_DISAGREES`, and with
  `VERIF_ENGINE_UNAVAILABLE` when the engine is not loaded. Each result carries
  `engineRecheck` (the enclosure), which the results screen shows as the proven-bound badge.
  Tests: `__tests__/cirsoc301-engine-gate.test.ts`.
- **Design and verification of the whole model** (`auto-verify.ts` → `verifyElement`, used
  by `runCirsocDesign` and by the report). This path designed and checked with the same
  TypeScript, so its own defects passed its own designs. `codes/argentina/cirsoc201-engine-gate.ts`
  now re-checks every result. It takes the bars, their real diameters (the TypeScript sized `d`
  for Ø16 whatever it chose) and the stirrups, and asks the engine about beam flexure, shear and
  ductility. Columns go to the Rust column kernel on the standard layout of the chosen bars,
  under the compression and under any tension the member sees. A TypeScript pass the engine
  does not confirm becomes a failure with `VERIF_ENGINE_DISAGREES` and the engine's ratios. An
  engine that cannot be asked gives `VERIF_ENGINE_UNAVAILABLE`, also a failure. Each result
  carries `engineRecheck`. That includes `notRechecked`, the checks the engine has no checker
  for yet: torsion and the slenderness magnifier. Biaxial bending is re-checked on the engine's
  load contour (refactor/concrete-in-engine), and a beam carries `engineRecheck.certified`, the
  interval enclosure of its flexure, ductility and shear utilisation from
  `certify_cirsoc201_members`. Since the legacy designer sizes against the engine, the gate's
  tests feed it the legacy designer's verifications (the oracle) to keep proving it catches them.

The gate found a real case on its first run. `verifyElement` designs a 25×50 beam under
Mu = 330 kN·m with 4 Ø32 + 2 Ø20 and passes it (warn). With the bars it chose, its εt is
2,6 ‰. That is below 9.3.3.1 of 2025 (5,1 ‰) and also below 10.3.5 of 2005 (4 ‰): the
designer anchored at 4 ‰ for the required steel and never looked at the provided steel. Tests:
`__tests__/cirsoc201-engine-gate.test.ts`.

- **Isolated footings** (`detailing/foundation-check.ts`). Every OK footing is handed to
  `certify_isolated_footings` (the same generic formulas in outward-rounded interval arithmetic).
  It stays OK only if the certified utilization of bearing, one-way shear and punching is
  provably below 1, and if full contact and an insignificant unbalanced moment are decided on
  the box. Otherwise it becomes FAIL with `engineRecheck` and a memo line. Tests:
  `__tests__/differential/footing-engine.test.ts`.

### 4. Migration of the duplicates into Rust

| Module | Status |
|---|---|
| CIRSOC 201 beam flexure and shear (`station-design-forces.ts` `computeFlexureCapacity`, `computeShearCapacity`) | **Migrated.** Thin adapters over `codes/argentina/cirsoc201-beam-kernel.ts` → `cirsoc201_beam_batch` (numeric boundary, the `steel-codes.ts` pattern without JSON, because the verifier asks thousands of times per run). The ductility check is new. |
| CIRSOC 201 legacy designer (`cirsoc201.ts` `checkFlexure`, `checkShear`, `checkColumn`, `checkBiaxial`) | **Sizes against the engine.** The flexural requirement is the least steel the engine's beam check passes (`cirsoc201_design.rs`, `cirsoc201_design_beam`), compression steel added (and topped up after bars are rounded) until the bars chosen are ductile; the verdict is the engine's check of the bars chosen, where they sit. Stirrups: the widest spacing whose engine φVn reaches Vu with Av ≥ Av,min. Columns: the least standard layout whose engine φMn at every signed Nu reaches Mu (`computeColumnCapacity` → section engine). Biaxial: the engine's load contour. The searches (bar tables, spacings) stay in TypeScript; every number they test is the engine's. Torsion and the slenderness magnifier are still TypeScript (#366). |
| CIRSOC 201 sections (`cirsoc201-section.ts`, `section-polygon.ts`, `cirsoc201-basis.ts`, `cirsoc-flex*.ts`) | **Migrated.** `cirsoc201_section.rs`: strain compatibility over any outline (polygons and exact circles, holes) with bars, generic over `Real`; φ (ties/spiral) and the caps by edition; the diagram, the eccentricity ray, the axial limit, the biaxial load contour and the characteristic points. `Cirsoc201SectionKernel` replaces `RcSectionGeometry` and the TypeScript fallback integration. The CIRSOC_FLEX sizing searches stay in TypeScript. |
| Flanged, circular, capacity, interaction diagram (`cirsoc201-flanged.ts`, `-circular.ts`, `-capacity.ts`, `interaction-diagram.ts`) | **Migrated.** Thin adapters: the beam check (with `bf`, `hf`) for flanged and given-steel capacity, the section engine for circular columns, rectangular columns and the diagram. |
| Slabs (`losas.ts`) | **Migrated.** Strip requirement from `cirsoc201_design_beam` (b = 1 m, singly), capacity of the bars chosen from the beam check, As,min and spacings from `cirsoc201_slab_provisions` (2025: 7.6.1.1, 8.6.1.1, 24.4.3.2, 7.7.2.3, 8.7.2.2, 24.4.3.3). Bar/spacing choice stays in TypeScript. |
| Station verifier columns (`station-design-forces.ts` `computeColumnCapacity`, `computeBiaxialCapacity`) | **Migrated.** `column_capacity_kernel.rs` delegates to the section engine (edition-aware); the TypeScript reference solver is an oracle; no bars → not verified. Biaxial: the load contour with the real bars, four sign quadrants, instead of Bresler with Nu·φMn/Mu estimates. |
| CIRSOC 301 (`cirsoc301.ts`) | **Migrated.** A thin adapter over `check_cirsoc301_members` (`cirsoc301-kernel.ts`, JSON boundary): it maps `SteelDesignParams` in and the results out and renders the engine's messages as the Spanish `steps`. No engine = every check fails. Every pass is re-checked by `cirsoc301-engine-gate.ts` (step 3). Single and double angles are new (E.5, E.6). Still TypeScript (class c, inputs to the engine): `steel/tension-connection.ts` (Ae from the model's end connections), `steel/moment-gradient.ts` (Cb), `steel/section-constants.ts` (J, Cw, Z). |
| Serviceability (`checkDeflection`) | **Migrated.** The verdict (allowable deflection, ratio, pass) comes from `check_serviceability`. Only the long-term multiplier stays in TypeScript. If the engine is not loaded, the check fails. `checkCrackWidth` has no engine counterpart; it was fixed but stays in TypeScript. |
| Footings (`foundation-check.ts`) | **Migrated.** A thin adapter over `check_isolated_footings` (`engine/src/postprocess/isolated_footing.rs`): service bearing with biaxial eccentricity and the column's plan offset, factored one-way shear in both directions and from both faces, punching with the soil inside the perimeter deducted and the unbalanced moment formed by equilibrium (refused when significant or not formable), column-face flexure along both axes. The formulas are generic over `Real`; `certify_isolated_footings` evaluates them in interval arithmetic and gates every OK (step 3). The old TypeScript is `__tests__/differential/foundation-check-oracle.ts`. `punching-shear.ts` stays for slab-column punching (`slab-punching.ts`), which the engine does not cover. |
| Station design forces | **Engine only.** `computeStationDemands` throws `EngineUnavailableError` without the engine or the model; the TypeScript extraction is `__tests__/differential/station-oracle.ts`. |
| CIRSOC 101 combinations (`codes/cirsoc101/combinations.ts`) | **Migrated.** Adapter over `engine/src/loads/cirsoc101_combinations.rs` (`loads_request`, op `cirsoc101Combinations`). The #292-verified TypeScript is `__tests__/combinations-oracle.ts`; `combinations-engine.test.ts` compares all 1 024 subsets of the ten loads and 3 000 random option sets, id for id, term for term, reference for reference. |
| INPRES-CIRSOC 103 spectrum and static method (`codes/cirsoc103/spectrum.ts`, `static-method.ts`) | **Migrated.** Adapters over `engine/src/loads/cirsoc103_seismic.rs`: Tabla 3.1, [3.1]–[3.4], [3.13]/[3.14], [3.15], Tablas 6.1/6.2, [6.3]–[6.7], [6.11]–[6.13], Tabla 2.5. The adapters write the messages and references. `seismic-engine.test.ts` compares every zone × site × fault factor and 3 000 random period/coefficient/distribution/applicability cases with the verified oracles, and pins the constant tables the app still reads directly (`RISK_FACTOR`, `SIMULTANEITY_F1/F2`, `ZONE_AS`, `ZONE_T3`, `PERIOD_COEFFICIENTS`) to the engine's. LOADS.md's tests (`verification-*.test.ts`) now run against the engine. |

### 5. Hardening what stays in TypeScript

**Property test of the detailing invariants**
(`design/__tests__/detailing-invariants.property.test.ts`). Random fixed-ended beams are
solved by the engine and designed by the bounded search. For every VERIFIED outcome the
accepted bars are re-checked from geometry, not read back from the verdict:

- engine φMn ≥ Mu at span and supports, with the other face's bars as compression steel;
- εt ≥ εt,min;
- engine φVn ≥ Vu;
- every row's clear spacing ≥ max(25 mm, db) inside bw − 2·(cover + stirrup), which means the
  cover is respected;
- stirrup spacing ≤ min(d/2, 600 mm).

Each run certifies more than 10 beams. A deliberately broken threshold is caught, and
shrinking reduces it to its boundary.

**Mutation testing.** Config: `web/stryker.config.json`. Run it with `npm run test:mutation`.
It runs nightly in `.github/workflows/mutation-ts.yml`. Stryker runs a focused test set,
`web/vitest.mutation.config.ts`: 62 files that take 9 s, where the whole unit pass took long
enough that Stryker's dry run timed out. `.stryker-tmp` is excluded from vitest, because a
sandbox collected by a normal run made every engine test fail: the WASM build is gitignored and
so missing from the sandbox. The config re-includes the build for Stryker.

Results on the critical modules this branch added or relies on:

| Module | First run | After new tests | Notes |
|---|---:|---:|---|
| `codes/argentina/cirsoc201-engine-gate.ts` | 49,6 % (112 of 244 survived) | 82,8 % (39 survived) | The rest are equivalent: a NaN ratio that `!(x ≤ 1)` already fails, `<` against `≤` at exactly 1,0, and diagnostic text. |
| `codes/argentina/cirsoc201-beam-kernel.ts` | 80,4 % | 96,1 % | The survivor is the output-length guard, which only fires on a mismatched engine build. |
| `design-check-results.ts` | 50,6 % | 55,8 % | The normalisers for engine results read snake_case while the engine emits camelCase (fixed, found by a test written to kill these mutants). Most survivors are in label and combo-name plumbing of `normalizeCirsoc301` and `normalizeCirsoc201`. |

The full critical set in `stryker.config.json` (CIRSOC 301, serviceability, footings,
auto-verify, the candidate search, CIRSOC 201 anchorage and spacing) has not been run here. The
machine was shared by eight agents. The nightly job runs it.

### 6. Silent fallbacks removed (#321)

The engine is the only source of engineering results. When it is not loaded the app says
"engine not available" (`engine.unavailable`), and when it fails it shows the engine's message;
it never computes the number with a TypeScript duplicate. `engine-unavailable.ts` holds the two
errors (`EngineUnavailableError`, `EngineCheckError`), `store/engine-status.svelte.ts` the
reactive readiness that screens computing before the engine arrives recompute on.

| Path | Before | Now |
|---|---|---|
| `section-stress.ts` `analyzeSectionStress`, `section-stress-3d.ts` `analyzeSectionStress3D` / `FromForces` | Full TypeScript Navier/Jourawski/torsion/Mohr when `!isWasmReady()` | Engine only; the stress panel shows "engine not available" or the engine's error (`stress-engine-failure`). Oracle: `differential/section-stress-oracle.ts`; `section-stress-engine.test.ts` compares 4 000 random members/sections/fibres. |
| `shell-combos.ts` `enrichComboShellStresses`, `combineShellStresses` (also used by `superposed` and the all-loads baseline) | TypeScript recombination when the kernel was not registered | Kernel only (a frame without shells needs none). Oracle: `differential/shell-combos-oracle.ts`, compared on 500 random batches. |
| `verification-service.ts` `computeStationDemands` | JS `extractElementStations` without the engine or model | Throws; design-run reports `engine.unavailable`. Oracle: `differential/station-oracle.ts`. |
| `wasm-solver.ts` design-check wrappers (13) | `catch { return null }`, losing the engine's reason | Throw `EngineUnavailableError` / `EngineCheckError`. `other-codes/run.ts` withdraws every row of the run and shows the message; `ProOtherCodesPanel` and `serviceability.ts` show it too. |
| `codes/argentina/cirsoc201-section.ts` `prepareSection` (flexure calculator, P–M) | TypeScript `sectionPoint` integration when the RC kernel was missing | Throws: every section evaluation (`prepareSection`, `sectionPoint`) goes to the engine's CIRSOC 201 section kernel through `cirsoc201-engine.ts`, which throws an engine-unavailable error when it is not loaded (`differential/cirsoc201-section.test.ts`, "without the engine nothing is computed"). The TypeScript integration it replaced is a test oracle under `__tests__/differential/oracle/`. |
| `member-stresses.ts` | Bounding rectangle when the engine failed on a geometry-backed section (not a bound for angles/channels) | The section is not read and the table counts it as unread. |
| `wasm-solver.ts` header, `App.svelte` | "falls back to JS solver" | Corrected; a failed engine load is a toast and `engineStatus.error`. |

`__tests__/no-silent-fallback.test.ts` fails if app code imports an oracle or switches the RC
section to a TypeScript reference, or if a design-check wrapper returns `null` again.

## What is left

In rough order of safety value:

1. **CIRSOC 301 inputs still computed in TypeScript.** The checker is in Rust and gated, but Ae
   from the model's end connections (`tension-connection.ts`), Cb (`moment-gradient.ts`) and J,
   Cw, Z (`section-constants.ts`) are TypeScript arithmetic fed to it. Not in the engine either:
   F.7–F.11 (boxes, tubes, tees, angles in flexure), so those members are NOT EVALUATED under
   moment, by name.
2. **Gate coverage.** Torsion and the slenderness magnifier are not re-checked by the engine,
   because it has no checkers for them (#366). Each result says so in
   `engineRecheck.notRechecked`. (Biaxial bending is re-checked now, on the load contour.)
3. **Certification of columns.** The beam check (rectangles and T sections, with axial force)
   is certified (`certify_cirsoc201_members`, and the gate attaches the enclosure to every beam).
   The section engine's state is generic over `Real` and refuses undecided comparisons, but the
   column searches (the neutral axis at a given Pu, the biaxial direction) are f64: columns,
   circular sections and the biaxial contour are not certified.
6. **Footings, what the engine does not do.** Combined/strip footings, mats, pile caps, the
   reduced effective area past the kern (refused), moment transfer by eccentric shear (8.4.4.2,
   refused), edge and corner moment formation (refused). Footing mat design
   (`footing-flexure.ts`, `footing-mat-anchorage.ts`) and `footing-actions.ts` (used by the
   flexure design) are still TypeScript.
7. **Remaining TypeScript computations on engine results.** `diagrams.ts` deformed shape
   still has a TypeScript Hermite fallback (display only); `diagrams*.ts` evaluate M/V/N in
   TypeScript for display and for the rotated-2D stress panel's forces; `stress-heatmap.ts`
   colours members by a TypeScript bound; `detailing/collision.ts` has a TypeScript
   broad/narrow phase when its kernel is missing; `combination-methods.ts` combines shells by
   SRSS/ABS in TypeScript.
8. **P-Delta.** No TypeScript correction of member forces remains (#283). B2 and the
   stability verdict are read in TypeScript from the engine's two sets of displacements
   (`pdelta-amplification.ts`), and `direct-analysis.ts` uses B2 > 1,7 to decide C2.2b's
   notional loads; a reversed or vanishing displacement is read as unstable, never as stable.
9. **PRO report slab steel** (finding 13) is no longer printed. The section invented its load, span and f'c, and now says that slab steel is designed in the slab design. A report section built from the slab design's own results would be the real fix.
10. **Load generation still in TypeScript.** Moved: CIRSOC 101 combinations and the
    INPRES-CIRSOC 103 spectrum and static method. Not yet: CIRSOC 102 wind (`codes/cirsoc102/*`,
    `loads/load-plan-wind.ts`, `wind-cases.ts`, `wind-other.ts`), CIRSOC 104 snow
    (`codes/cirsoc104/*`, `loads/snow-*.ts`), CIRSOC 101 dead/live/roof-live tables and
    reduction (`dead-loads.ts`, `live-loads.ts`, `roof-live.ts`, `loads/case-reduction.ts`),
    service combinations (`service-combinations.ts`), the expansion of symbols onto cases
    (`loads/combination-cases.ts`), accidental torsion (`loads/seismic-cases.ts`) and the modal
    story forces with their own CQC (`loads/seismic-modal.ts`, finding 10). Each has its
    clause-by-clause tests from #292 to serve as the oracle when it moves.
11. **CIRSOC 201 detailing that stays in TypeScript**: bar selection and clear-spacing fit
    (`cirsoc201-bars.ts`, `cirsoc201-layouts.ts`, `selectRebar`, `selectSlabRebar`) — searches
    whose result is checked by the engine; `checkTorsion`, `checkSlender` (#366); the slab support
    and corner-torsion steel of `losas.ts` (practice rules, not clauses); 2005 slab spacings,
    whose text is not in this repository (the engine keeps the app's former, stricter values).

## Inventory

| Module | Lines | Class | Rust counterpart | Safety | What it computes |
|---|---:|:-:|---|:-:|---|
| `advanced-analyses.ts` | 362 | b | engine/src/solver/creep_shrinkage.rs (ec2_creep_coefficient, ec2_shrinkage_strain) | medium | EC2 Annex B creep phi and shrinkage strain recomputed in TS (also in Rust creep solver); plus TS-only lumped nodal/notional loads, effective-modulus and pushover Mp plumbing |
| `analysis-settings.ts` | 92 | d | - | low | Analysis rules model (self-weight rule, combination method) types and helpers |
| `auto-loads.ts` | 103 | c | - | low | Legacy CIRSOC 101-2005 occupancy/dead-load tables; only read by CAD fixture generator script |
| `auto-verify.ts` | 316 | c | - | high | Orchestrates TS CIRSOC 201 verifyElement on 3D results; own demand extraction (max-abs of non-concurrent station demands, endpoint-only fallback) and beam axis choice by stress proxy |
| `axial-shares.ts` | 60 | c | - | high | Corrects member end axial forces for axial member loads lumped at nodes (N0+pI, N0-pJ) before design |
| `bar-marks.ts` | 178 | c | - | low | Bar marks, cutting lengths, stock splices and steel weights for RC schedules (quantities) |
| `calc-report-loads.ts` | 126 | d | - | low | Formats load components text for calc report with unit conversion |
| `calc-report.ts` | 674 | d | - | low | HTML calc-book report generator |
| `case-displacements.ts` | 107 | c | - | medium | Imposed displacements of a load case scaled by combination factor and restrained-DOF validation |
| `case-effects.ts` | 316 | c | - | high | Builds per-case solver loads: live-load reduction ratios, notional horizontal loads, composite case includes with factors |
| `codes/argentina/cirsoc-flex-diagram.ts` | 47 | d | - | low | Shapes capped/uncapped interaction diagram series for plotting (calls section engine) |
| `codes/argentina/cirsoc-flex-points.ts` | 132 | c | - | medium | Six characteristic interaction-diagram points solved by neutral-axis depth (CIRSOC_FLEX sheets) |
| `codes/argentina/cirsoc-flex-surface.ts` | 216 | c | - | medium | Biaxial interaction surface cut at fixed axial load; phiMn/Mu moment capacity |
| `codes/argentina/cirsoc-flex.ts` | 1060 | c | - | high | CIRSOC_FLEX workbook calculator: design/verify 8 section cases (beam, T, columns, biaxial) via TS section engine, bar choice, min steel, axial cap |
| `codes/argentina/cirsoc201-bars.ts` | 366 | c | - | medium | Bar selection from steel area with §25.2 clear-spacing fit |
| `codes/argentina/cirsoc201-basis.ts` | 154 | b | engine/src/postprocess/cirsoc201_check.rs (compute_beta1, compute_phi), rc_check.rs | high | Shared CIRSOC 201 clauses: beta1, phi from strain, eps_cu, axial cap, min flexural steel (also feeds rc_section_kernel constants) |
| `codes/argentina/cirsoc201-capacity.ts` | 413 | b | engine/src/postprocess/rc_check.rs (flexural capacity, axial_flexure_capacity), cirsoc201_check.rs | high | Given-steel capacity of rect/flanged sections and rect column check/design by bisection |
| `codes/argentina/cirsoc201-circular.ts` | 355 | c | - | high | Circular column P-M interaction (segment + bar ring), check and design |
| `codes/argentina/cirsoc201-flanged.ts` | 193 | b | engine/src/postprocess/rc_check.rs (flexural_capacity_tbeam) | high | T-beam flexure design (block in flange vs web split) |
| `codes/argentina/cirsoc201-layouts.ts` | 255 | d | - | medium | Bar coordinate layouts reproducing workbook conventions (geometry placement) |
| `codes/argentina/cirsoc201-section.ts` | 288 | b | engine/src/rc_section_kernel.rs | high | General polygon section strain-compatibility P-Mx-My; WASM kernel when registered, full TS sectionPoint fallback otherwise; phi/cap applied in TS |
| `codes/argentina/cirsoc201.ts` | 1520 | b | engine/src/postprocess/cirsoc201_check.rs, rc_check.rs | high | CIRSOC 201 flexure, shear, column, torsion, biaxial, slenderness, detailing checks (known duplicate) |
| `codes/argentina/cirsoc301.ts` | 852 | a | engine/src/postprocess/cirsoc301_check.rs | high | Adapter over check_cirsoc301_members (was the TS duplicate; now the differential oracle) |
| `codes/argentina/flex-demand-from-model.ts` | 76 | d | - | medium | Maps station resultants to calculator demand fields with one sign flip |
| `codes/argentina/index.ts` | 8 | d | - | low | Re-export barrel |
| `codes/argentina/interaction-diagram.ts` | 261 | b | engine/src/postprocess/rc_check.rs (axial_flexure_capacity), column_capacity_kernel.rs | high | Rectangular two-layer P-M interaction diagram scan plus SVG |
| `codes/argentina/losas.ts` | 449 | c | - | high | One-way/two-way/cantilever slab reinforcement design, support check, torsion corner steel |
| `codes/argentina/cirsoc201-engine.ts` | 71 | a | engine/src/postprocess/cirsoc201_section.rs | high | WASM boundary for the CIRSOC 201 section kernel, basis, φ and design; throws when the engine is not loaded |
| `codes/argentina/section-polygon.ts` | 194 | c | - | medium | Polygon area/centroid, half-plane clip, compressed zone for cracked sections |
| `codes/argentina/section-shape.ts` | 16 | d | - | low | Section outline type |
| `codes/argentina/serviceability.ts` | 146 | b | engine/src/postprocess/serviceability.rs | high | Crack width (Gergely-Lutz, TS-only part) and deflection limit check (known duplicate) |
| `codes/design-codes.ts` | 98 | d | - | low | Registry of design code editions offered by calculator |
| `column-capacity-kernel.ts` | 8 | a | engine/src/column_capacity_kernel.rs | high | WASM kernel registry with enable switch (TS path used when disabled/unregistered) |
| `combination-methods.ts` | 424 | b | engine/src/postprocess/combinations.rs (combine_results_3d) | high | SRSS/ABS magnitude combinations (TS-only) and linear superposition replacing engine combiner for spectral combos |
| `combinations-service.ts` | 19 | d | - | low | inferLoadCaseType from name only |
| `connection-design.ts` | 326 | b | engine/src/postprocess/connection_check.rs (check_bolt_groups, check_weld_groups) | high | CIRSOC 301 J bolt group shear/bearing and fillet weld capacity, pure JS (Rust wrapper unused here) |
| `constraint-2d-remap.ts` | 88 | d | - | medium | Maps 3D constraint DOFs to 2D solver convention |
| `constraint-connectivity.ts` | 92 | d | - | low | Adds constraint pairs as graph edges for connectivity checks |
| `contour-scale.ts` | 47 | d | - | low | Shell contour nodal averaging and band scale |
| `curved-beam.ts` | 75 | b | engine/src/element/curved_beam.rs (curved_beams preprocessor) | medium | Arc through 3 points discretised into straight chords web-side |
| `deflection-limits.ts` | 72 | c | - | high | Deflection limit rules L/n per member, cantilever 2L/n, direction selection |
| `deflection-spans.ts` | 154 | c | - | high | Physical span over which deflection is measured (merges collinear elements, stops at supports) |
| `dense-solve.ts` | 93 | c | - | low | Dense Gaussian elimination allowing null modes for step-by-step solvers |
| `design-check-results.ts` | 337 | d | - | medium | Normalizes check results; unused WASM normalizers map 1.0<ratio<=1.1 to warn |
| `design/adapters/cirsoc201-adapter.ts` | 302 | d | - | high | Adapter wrapping station-design-forces verifier and candidate generators |
| `design/adapters/cirsoc201-capabilities.ts` | 201 | d | - | low | Capability matrix declarations |
| `design/adapters/cirsoc301-capabilities.ts` | 191 | d | - | low | Steel capability matrix (all false) |
| `design/adapters/cirsoc301-clause-map.ts` | 353 | d | - | low | Clause map metadata for CIRSOC 301 checker |
| `design/adapters/unsupported-adapter.ts` | 105 | d | - | low | Unsupported code adapters returning UNSUPPORTED |
| `design/behaviour-demands.ts` | 66 | d | - | high | Masks axial demands by member behaviour (tension-only, inactive) |
| `design/candidate-enumerate-beam.ts` | 321 | c | - | medium | Beam rebar candidates: seed area, bars per row, stirrup options (verdict by verifier) |
| `design/candidate-enumerate-column.ts` | 175 | c | - | medium | Column rebar candidates with rho limits and max tie spacing |
| `design/candidate-generator.ts` | 51 | d | - | low | Candidate generator interface |
| `design/candidate-search.ts` | 486 | d | - | medium | Bounded deterministic search calling adapter verifier |
| `design/canonical-hash.ts` | 83 | d | - | low | Canonical JSON and FNV hash |
| `design/code-adapter.ts` | 137 | d | - | low | Design code adapter interfaces/registry |
| `design/crack-spacing.ts` | 34 | c | - | medium | CIRSOC 201-2025 §24.3.2 crack-control bar spacing check of provided bars |
| `design/design-axes.ts` | 176 | d | - | high | Governing moment/shear axis resolution with biaxial threshold |
| `design/design-families.ts` | 181 | d | - | low | Design family selection |
| `design/final-geometry-feedback.ts` | 573 | d | - | medium | Feedback/repair bookkeeping from final-geometry reverification |
| `design/member-context.ts` | 351 | d | - | high | Assembles per-member design context (materials, demands, critical sections, slenderness) |
| `design/member-grouping.ts` | 428 | d | - | low | Geometry-derived member grouping |
| `design/objective.ts` | 174 | d | - | low | Candidate cost objective (steel mass, congestion) |
| `design/orientation-diagnostic.ts` | 146 | d | - | low | Force-orientation diagnostic |
| `design/other-codes/cfs-code.ts` | 112 | a | engine/src/postprocess/cfs_check.rs | high | AISI S100 via WASM checkCfsMembers; TS builds inputs (LTB j, cw) |
| `design/other-codes/cfs-effective.ts` | 145 | c | - | high | AISI S100 App.1 effective width/area/modulus of lipped channels fed to Rust checker |
| `design/other-codes/concrete-codes.ts` | 153 | a | engine/src/postprocess/rc_check.rs, ec2_check.rs | high | ACI 318 / EC2 checks via WASM |
| `design/other-codes/ec3-classify.ts` | 56 | c | - | high | EN 1993-1-1 section class and buckling curves fed to Rust EC3 checker |
| `design/other-codes/index.ts` | 17 | d | - | low | Registry of other codes |
| `design/other-codes/rc-bars.ts` | 122 | d | - | medium | Reads provided bars at a demand for RC checkers |
| `design/other-codes/run.ts` | 120 | a | engine/src/postprocess (via code.run) | high | Runs WASM checkers per demand round; null result becomes error, unevaluated never pass |
| `design/other-codes/steel-codes.ts` | 209 | a | engine/src/postprocess/steel_check.rs, ec3_check.rs | high | AISC 360 / EC3 via WASM |
| `design/other-codes/steel-props.ts` | 93 | d | - | medium | Reads steel section properties for checkers (refuses unsupported shapes) |
| `design/other-codes/types.ts` | 102 | d | - | low | Types |
| `design/outcome.ts` | 360 | d | - | medium | Outcome contract and utilization thresholds |
| `design/rebar-batch.ts` | 390 | d | - | low | Batch reinforcement edit preview |
| `design/rebar-hash.ts` | 39 | d | - | low | Rebar hash |
| `design/section-advice.ts` | 218 | c | - | medium | Preliminary closed-form section size recommendation and iteration guards |
| `design/slenderness.ts` | 40 | c | - | high | Column slenderness magnifier delta_ns per combination via TS checkSlender |
| `detailing/assembly.ts` | 718 | d | - | low | Persisted detailing assembly types |
| `detailing/bar-shape-diagram.ts` | 350 | d | - | low | Bending schedule shape diagrams with leg lengths |
| `detailing/beam-top-steel.ts` | 324 | c | - | medium | Hanger/minimum top steel for beams per CIRSOC 201-2025 clauses |
| `detailing/candidates.ts` | 547 | c | - | medium | Legal bar layout candidates with clear-spacing rules |
| `detailing/classify.ts` | 410 | c | - | medium | Bar pair classification and applicable §25.2 clearance rule |
| `detailing/collision-kernel.ts` | 37 | a | engine/src/collision_kernel.rs | medium | WASM collision kernel registry |
| `detailing/collision.ts` | 887 | b | engine/src/collision_kernel.rs | medium | Bar capsule collision detection; uses WASM kernel when registered, full TS broad/narrow phase fallback otherwise |
| `detailing/column-bar-index.ts` | 84 | d | - | low | Spatial index of column bars |
| `detailing/column-candidates.ts` | 353 | c | - | medium | Column cage layout candidates with spacing/restraint rules |
| `detailing/conflict-inventory.ts` | 293 | d | - | low | Conflict inventory report |
| `detailing/constructibility.ts` | 378 | d | - | medium | Constructibility gate from facts |
| `detailing/coordinate-floor.ts` | 642 | d | - | medium | Floor detailing orchestrator: groups lines/stacks, joint layer application, collision repair loop, marks; uses min clear spacing helpers but no own capacity math |
| `detailing/coordinate-line.ts` | 381 | d | - | low | Dynamic-programming coordination of bar layouts along a beam line/column stack (cost weights, target utilization 0.92) |
| `detailing/coordination-search.ts` | 692 | d | - | medium | Global CSP search choosing one rebar layout per member compatible at joints; lap-legality fallback (same diameter => contact lap OK) when no transition oracle |
| `detailing/design-convergence.ts` | 291 | d | - | medium | Gate deciding what a detailing run may be called vs requested scope (blocks CONSTRUCTIBLE when members were refused); state logic only |
| `detailing/design-feedback-loop.ts` | 403 | d | - | medium | Design-detailing loop: reverify at final geometry via injected adapter.verify, demote failing arrangements, re-coordinate; orchestration only |
| `detailing/document-model.ts` | 601 | d | - | low | Assembles single DocumentModel (regulations, revisions, certificates, assemblies, conflicts, maturity) for PDF/DXF/XLSX |
| `detailing/document-narrow.ts` | 196 | d | - | low | Projection of the built document onto a user selection; bar mass totals via markMassKg (trivial) |
| `detailing/document-render.ts` | 1906 | d | - | low | Renders DocumentModel to report/drawing set/bar schedule (SVG/DXF/XLSX); no new facts computed |
| `detailing/drawings.ts` | 1111 | d | - | low | SVG reinforcement drawings from actual BarPath geometry (elevations, sections, joint details) |
| `detailing/element-status.ts` | 512 | d | - | low | One-word per-member status joining scene (has steel) with design outcome (verified/refused) |
| `detailing/family-drawings.ts` | 411 | d | - | low | Footing plan and two sections drawings from design record and real bars |
| `detailing/family-record.ts` | 1036 | d | - | low | Persisted floor-family (slab/wall/footing) design record with canonical hashes and provenance |
| `detailing/floor-design.ts` | 925 | c | - | high | Generates slab bars and footing dowels; checks §16.3.4.1 dowel interface area, hooked development (§25.4.3.1) vs available, laps; builds floor assembly + collisions |
| `detailing/floor-family-state.ts` | 313 | d | - | low | Known/unknown counts per floor family (null not 0) for UI |
| `detailing/floor-transverse.ts` | 437 | c | - | medium | Required transverse steel for slabs/walls/footings/dowels: starter tie spacing/count, wall curtains (1 vs 2), wall bar generation per code minima |
| `detailing/footing-actions.ts` | 443 | b | foundation_check.rs check_spread_footings (eccentricity_x/y, max_bearing_pressure) | high | Transforms node reactions to footing-centroid actions (N*e offset), moment eccentricity, trapezoidal axis/plan soil pressure, unbalanced moment for punching; helper of TS bearing check |
| `detailing/footing-dowel-cage.ts` | 1009 | c | - | medium | Physical placement of starter hooks seated on bottom mat (hook need, carrying layer, seating tolerance search) |
| `detailing/footing-flexure.ts` | 1623 | c | - | high | Footing bottom-mat flexural design CIRSOC 201 Ch.13 both directions: cantilever soil-pressure moment, As req/min, bar count, spacing, §13.3.3 band distribution, ld; uses TS checkFlexure (itself a Rust duplicate); Rust foundation_check has no flexure |
| `detailing/footing-mat-anchorage.ts` | 276 | c | - | high | Verifies available anchorage of generated mat bars from §13.2.7.1 critical section vs required development length (Ch.25, deriveDevelopment) |
| `detailing/footing-mat-geometry.ts` | 670 | d | - | medium | Generates physical bottom-mat bars from the flexure design (positions, elevations, hooks); re-derives no numbers |
| `detailing/foundation-check.ts` | 673 | b | foundation_check.rs check_spread_footings | high | Isolated spread footing check: bearing (eccentric trapezoidal), one-way shear at d, punching (via punching-shear.ts), flexure Mu at column face; production path while Rust check_spread_footings has no production caller |
| `detailing/generate-beam.ts` | 1296 | c | - | high | Beam bar generation from moment envelope: §9.7.3 theoretical cutoffs + extension max(d,12db), development checks, stirrup zones from shear demand, bar row layout |
| `detailing/generate-column.ts` | 904 | c | - | high | Column stack generation: offset slope 1/6 (§10.7.4), splice zones, tie spacing (§10.7.6/§25.7.2), bar positions, beam-column joint layer allocation; uses computeColumnLayout |
| `detailing/joint-layers.ts` | 277 | c | - | medium | Floor-wide crossing layer order at joints; crossing separation, layer step, effective depth loss after raise (feeds reverification) |
| `detailing/joint-packing.ts` | 389 | d | - | medium | Deterministic threading of beam bars through gaps between column bars in joint volume (geometry packing) |
| `detailing/joint-shear.ts` | 353 | c | - | high | Beam-column joint shear CIRSOC 201 §15.4: free body from beam steel (jd=0.875 assumed), effective joint area, gamma coefficient, phi=0.75, equilibrium-residual gate |
| `detailing/lap-materialize.ts` | 501 | d | - | medium | Turns splice schedules into physical lapped bars (contact/non-contact §25.5.1.3 offsets); geometric endpoint clustering fallback |
| `detailing/member-geometry.ts` | 139 | d | - | low | Reads frame member concrete (b,h, nodes) from model into scene shape; refuses when unknown |
| `detailing/punching-shear.ts` | 566 | b | foundation_check.rs check_spread_footings (punching_shear_ratio, footings only) | high | Two-way shear CIRSOC 201 §22.6: critical perimeter by column position, demand from reaction minus load inside perimeter, unbalanced moment transfer, vc three-formula min with size effect; general slab+footing engine, Rust covers only footing ACI-simplified punching |
| `detailing/run-detailing.ts` | 2605 | d | - | medium | Production adapter from verified RC design to detailing assemblies: readiness, drives generators/coordination/collisions/reverify callback, constructibility facts; mixed with code-rule decisions (§25.4.1.2 hook use, face packing) |
| `detailing/run-floor-design.ts` | 1044 | c | - | high | Production slab/wall/punching adapter: shell normals/classification, wall Pu/Vu from sigmaYy/tauXy x t x L, one-way shear demand from surface loads; calls slab/wall/punching design (orchestration + demand arithmetic) |
| `detailing/run-footing-design.ts` | 1147 | c | partial: postprocess/foundation_check.rs (via TS checkFooting) | high | Footing production path: governing strength reaction, service reaction summed per gravity case at unit factors, punching position, development lengths; calls TS checkFooting/designFootingMat (Rust check_spread_footings exists but not used here) |
| `detailing/scene-cache.ts` | 111 | d | - | low | Memo cache for 3-D reinforcement scene |
| `detailing/scene-model.ts` | 1135 | d | - | low | 3-D scene projection of the detailing document (bar sampling, filters, bounds) |
| `detailing/sheet-geometry.ts` | 648 | d | - | low | Drawing geometry: member outlines, cover inset, dimensions on sheets |
| `detailing/slab-design.ts` | 468 | c | - | high | CIRSOC 201 Ch.7/8 slab design: Wood-Armer moments, As,min 0.0018, bar spacing limits, bar selection, one-way shear phi*Vc; no Rust slab design |
| `detailing/slab-punching.ts` | 692 | c | - (foundation_check.rs punching covers footings only) | high | Slab-column punching collector: transferred force  |
| `detailing/slab-wall-drawings.ts` | 735 | d | - | low | Slab plans and wall elevation/section sheets (drawings) |
| `detailing/splice.ts` | 316 | c | - | high | CIRSOC 201 §25.5 lap splices: Class A/B classification, lap length max(1.0ld,300)/1.3ld, contact/non-contact pitch rules |
| `detailing/structure-drawings.ts` | 412 | d | - | low | General/level plans, horizontal sections, column detail sheets from scene |
| `detailing/structure-elevations.ts` | 193 | d | - | low | Frame-line, column-stack and joint elevation sheets from scene |
| `detailing/title-block-config.ts` | 142 | d | - | low | Title block text normalisation and code listing |
| `detailing/torsion-notice.ts` | 108 | d | - | medium | Flags members with unevaluated torsion above 0.1 kN·m floor (warning only, no check) |
| `detailing/wall-design.ts` | 396 | c | - | high | CIRSOC 201 Ch.11 wall design: min thickness, min ratios, in-plane shear 0.83sqrt(fc)Acv, axial-flexure phi 0.65; no Rust wall check |
| `diagrams-3d.ts` | 244 | b | postprocess/diagrams_3d.rs evaluate_diagram_3d_at / compute_diagrams_3d | high | TS analytical N/V/M/T along 3D members from end forces + loads (also SRSS/ABS combined, variable pieces); feeds station-forces.ts extractForcesAtStation -> station-design-forces design demands, reports, DXF |
| `diagrams.ts` | 451 | b | postprocess/diagrams.rs compute_diagram_value_at / compute_diagrams_2d / compute_deformed_shape | medium | TS 2D M/V/N diagrams and computeDiagramValueAt (used by section-stress.ts and influence-service.ts); deformed shape delegates to WASM but has a full TS Hermite fallback when WASM not ready |
| `diaphragm-rotation.ts` | 30 | c | - | high | Adds equal-rotation constraints about diaphragm normal for slave nodes (changes the model solved) |
| `direct-analysis.ts` | 389 | b | partial: solver/imperfections.rs notional_loads_3d (notional loads); P-Delta via WASM | high | AISC 360 Ch.C direct analysis: notional loads 0.002·Yi, tau_b = 4r(1-r), 0.8 stiffness reduction, then Rust P-Delta per combination (mixed a/c; Rust has its own notional-load routine unused here) |
| `dynamics/accelerogram.ts` | 191 | c | - | medium | Parses PEER/2-col/1-col ground records, unit scale, resamples onto analysis dt (applied ground motion) |
| `dynamics/mass-presets.ts` | 89 | c | - | medium | CIRSOC 103-2018 mass source preset: simultaneity factors f1/f2 per load case type |
| `dynamics/mass-source-model.ts` | 120 | c | - | medium | Converts case loads to mass loads as the solve converts them (excludes tendons/temperature/imposed) |
| `dynamics/mass-source.ts` | 377 | c | - | medium | Seismic mass Wi = Di + f1·Li + f2·Si per case factor -> densities added to elements |
| `dynamics/mass-weights.ts` | 78 | c | - | medium | Extra mass weights (members kN/m, slabs kN/m2, floor tributary) as loads for mass |
| `dynamics/requests.ts` | 201 | d | - | medium | Builders for spectral/time-history payloads; weight->mass density (/g), cumulative mass ratios, HHT alpha validation |
| `dynamics/section-mass.ts` | 47 | c | - | medium | Equivalent mass density for transformed composite sections |
| `dynamics/spectrum-compatible.ts` | 172 | c | - | medium | Spectrum-compatible artificial accelerogram: sinusoid sum, envelope, Newmark SDOF response spectrum iteration |
| `dynamics/time-history-spec.ts` | 124 | d | - | low | Time-history project data -> engine input (ground series per direction, force records) |
| `engine-diagnostics.ts` | 34 | d | - | low | Translates legacy solver diagnostic sentences |
| `expand-joints-3d.ts` | 111 | c | - | high | Solve-time expansion of 3D internal joints into helper nodes + eccentric connections with release masks (model transform) |
| `expand-semi-rigid-3d.ts` | 117 | c | - | high | Semi-rigid member ends: helper nodes + zero-length rotational connectors with stated stiffness; refuses misaligned axes |
| `force-method/drawn-axes.ts` | 50 | d | - | low | Sign conversion of force-method results to drawn local axes |
| `force-method/internal.ts` | 144 | c | - | low | Internal forces along bar and Gauss-quadrature Mohr integrals; small dense solve (educational) |
| `force-method/primary-3d.ts` | 198 | c | - | low | 3D degree of indeterminacy count and redundant candidates for force method (educational) |
| `force-method/primary.ts` | 246 | c | - | low | 2D indeterminacy count and primary structure choice (educational) |
| `force-method/redundants.ts` | 86 | c | - | low | Redundant selection with stability check / bounded search (educational) |
| `force-method/result-types.ts` | 71 | d | - | low | Types for force-method results |
| `force-method/solve-3d.ts` | 480 | b | solver/linear.rs (solve_3d) via alternative method | low | Educational 3D force (flexibility) method; same reactions/forces as stiffness solve, self-checked against DSM |
| `force-method/solve.ts` | 487 | b | solver/linear.rs (solve_2d) via alternative method | low | Educational 2D force method: delta_ij integrals, compatibility solve, superposition, checked against DSM |
| `forces-report-render.ts` | 114 | d | - | low | HTML renderer of raw forces report |
| `forces-report.ts` | 344 | d | - | low | Assembles raw forces report tables from results and station-forces |
| `foundation-springs.ts` | 44 | c | - | high | Winkler nodal springs k = ks·A from shell tributary areas (support stiffness applied to model) |
| `generators/built-up-section.ts` | 429 | c | - | medium | Built-up section properties (2/4 profiles): parallel-axis A/I, torsion basis -> section stiffness for analysis |
| `generators/emit.ts` | 394 | d | - | medium | Topology + profile per role -> loadable model (sections/materials assignment) |
| `generators/lattice-column.ts` | 210 | d | - | low | Lattice column geometry generator |
| `generators/member-roles.ts` | 71 | d | - | low | Member role vocabulary/tallies |
| `generators/preview-projection.ts` | 173 | d | - | low | Projection of generated topology for preview SVG |
| `generators/profile-resolve.ts` | 224 | d | - | low | Catalogue profile lookup with centroid offsets from canonical geometry |
| `generators/section-outline.ts` | 203 | d | - | low | Built-up section outline drawing |
| `generators/shed.ts` | 725 | d | - | low | Shed generator composing frames/trusses/purlins |
| `generators/structures.ts` | 397 | d | - | low | Other structure topology generators (frames, grids, domes) |
| `generators/truss-topology.ts` | 756 | d | - | low | Truss geometry/connectivity generator |
| `generators/variable-pair.ts` | 74 | d | - | low | Start/end section pair for variable members (welded I depth factor) |
| `governing-case.ts` | 159 | d | - | medium | Per-element governing combination per force component using max of end values |
| `influence-service.ts` | 152 | a | postprocess/influence.rs compute_influence_line | medium | Influence lines via WASM sweep or per-point WASM solve; V/M read with TS computeDiagramValueAt (diagrams.ts duplicate); truss ordinates by lever rule |
| `kinematic-2d.ts` | 386 | b | solver/kinematic.rs compute_static_degree_2d (rank via WASM analyze_kinematics_2d) | medium | TS static-degree count overrides Rust degree (Rust count documented wrong); rank/mechanism from WASM; without WASM returns isSolvable=false |
| `kinematic-3d.ts` | 315 | b | solver/kinematic.rs compute_static_degree_3d (rank via WASM analyze_kinematics_3d) | medium | TS 3D static-degree count overrides Rust degree; rank from WASM |
| `kinematic-model.ts` | 31 | d | - | low | Builds kinematic report for open model |
| `kinematic-report.ts` | 1579 | d | - | low | Didactic kinematic report (per-support/node breakdown, fix suggestions) |
| `live-calc.ts` | 437 | d | - | medium | Live/global solve orchestration, combination solve with fallback to single solve, error toasts |
| `loads/case-reduction.ts` | 74 | c | - | high | CIRSOC 101 §4.7 live-load reduction of a case (Lo, exclusions, tributary area) |
| `loads/combination-cases.ts` | 197 | c | - (combinations.rs only superposes given factors) | high | Expands symbol combinations (1.2D+1.0W+L) onto model cases, one per wind/seismic case/sense; produces the factors |
| `loads/combination-definition.ts` | 54 | d | - | low | Renders a combination back as symbol text |
| `loads/combination-rules.ts` | 93 | d | - | medium | User combination rules <-> specs, template IO |
| `loads/floor-loads.ts` | 547 | c | - | high | Floor area load to beams by tributary area: panels from plane graph, two-way/one-way |
| `loads/floor-skeleton.ts` | 212 | c | - | high | Straight-skeleton tributary cells for non-convex panels with openings |
| `loads/floor-tributary.ts` | 222 | c | - | high | Two-way/one-way tributary shares as partial linear loads per side |
| `loads/load-plan-delta.ts` | 236 | d | - | low | Preview count of combinations a plan adds |
| `loads/load-plan-seismic.ts` | 146 | c | - | high | INPRES-CIRSOC 103 seismic plan: static method/modal spectrum, design coefficient, height distribution, accidental torsion |
| `loads/load-plan-snow.ts` | 65 | c | - | high | CIRSOC 104 roof snow cases (balanced/unbalanced) via snow-loads |
| `loads/load-plan-wind.ts` | 357 | c | - | high | CIRSOC 102-2025 wind pressures per level/axis, gust factor, design cases §2.4.6, service Wa |
| `loads/load-plan.ts` | 1015 | c | - | high | Authoritative regulation load generator orchestrator: live patterns, roof weight, combination symbols, cases |
| `loads/notional-combinations.ts` | 48 | c | - | high | Adds notional-load variants to gravity-only strength combinations with source-case factors |
| `loads/plan-area-loads.ts` | 208 | c | - | high | Dead/live/roof-live area loads on members (CIRSOC 101 §4.8 R1/R2, §4.7 reduction) and seismic level weights |
| `loads/plan-gravity.ts` | 460 | c | - | high | Which members/shells carry area loads and tributary shares (beamLike slope rule) |
| `loads/plan-spans.ts` | 182 | d | - | medium | Span grid of a load plan and adjacent-span / partial-snow pattern enumeration (which units load in each pattern); geometry, no numbers |
| `loads/seismic-cases.ts` | 75 | c | - | high | Seismic load cases per level with accidental torsion Mta=Fk*eak, eccentricity table 6.3 (0/5/10 %) of INPRES-CIRSOC 103 |
| `loads/seismic-modal.ts` | 86 | b | solver/spectral.rs combine_cqc | high | CIRSOC 103 Cap.7 modal story forces: own cqcRho and CQC combination, Cm=Sam*gr/R, 90 % mass, 85 % Vod/Voe scaling; CQC duplicates Rust spectral |
| `loads/snow-config.ts` | 60 | c | - | medium | Snow dialog config; p_g from CIRSOC 104 ground-snow tables or site value; preview via codes/cirsoc104 roofSnow (TS) |
| `loads/snow-drift-loads.ts` | 322 | c | - | high | CIRSOC 104 drifts (Cap.7-8) and sliding snow (Cap.9) placed on roof steps/parapets as surcharge loads |
| `loads/snow-loads.ts` | 363 | c | - | high | CIRSOC 104 balanced/unbalanced/partial snow load cases on roof members (p_s, 0.3 p_s windward, ridge mean) |
| `loads/snow-shapes.ts` | 233 | c | - | high | CIRSOC 104 curved roof / dome / multiple-ridge snow distributions (C_s by slope, Fig 2-3 unbalanced profiles) |
| `loads/special-loads.ts` | 279 | c | - | high | CIRSOC 101 T/H/F cases: thermal dT, soil pressure K(g(zg-z)+q), fluid pressure to nodal forces via shell integration |
| `loads/wind-cases.ts` | 309 | c | - | high | CIRSOC 102 design wind cases 1-4 (3/4 factors, 0.563, torsion e=+-0.15B) as level forces and roof line loads |
| `loads/wind-dynamics.ts` | 141 | c | - | high | Wind fundamental frequency source (modal pick by mass ratio, approximate §1.9.3), beta defaults, low-rise test, gust inputs |
| `loads/wind-other.ts` | 229 | c | - | high | CIRSOC 102 wind on free roofs / other structures: p=qh G CN windward/leeward halves as load cases |
| `local-axes-3d.ts` | 149 | b | element/transform.rs (local axes) | high | 3D member local axes (auto-orient refs, roll, left-hand); must mirror Rust transform or loads/results land on wrong axes |
| `member-behaviour.ts` | 489 | a | solver/ solve_3d, ssi, cable | high | Tension/compression-only active-set loop, inactive members, CIRSOC 201 stiffness modifiers (TS constants) around WASM solve3D/SSI/cable; inputRef catch->null on zero-length |
| `member-deflection.ts` | 331 | c | - | medium | Member displaced shape: Hermite cubic + fixed-fixed particular solution of span loads, chord/tangent deflection used for serviceability checks |
| `member-loads.ts` | 224 | c | - | high | Single representation of member distributed loads: local/global/projected frames to solver loads, trapezoid pieces, axial-only transfer to nodes |
| `member-offsets.ts` | 182 | d | - | high | Rigid member offsets via helper nodes + eccentric constraints in solver input; zero-length catch -> skip member silently |
| `member-point-loads.ts` | 125 | c | - | high | Concentrated member force/moment to solver loads; detects when member must be cut (axial/moment at interior point) |
| `member-stresses.ts` | 100 | a | section/bending.rs (analyzeSectionBending) | medium | Station sigma max/min from WASM boundary stress coefficients; on WASM throw falls back to bounding-rectangle model (tagged basis='bounds') |
| `member-weight.ts` | 19 | c | - | high | Weight per metre rho*A or sum rho_i*A_i for composite drawn sections; feeds self-weight, statics and quantities |
| `mesh-weld.ts` | 54 | d | - | low | Coincident-node and beam-through-node geometry for shell mesh welding |
| `model-diagnostics.ts` | 660 | d | solver/pre_solve_gates.rs (partial overlap) | medium | Pre-solve model warnings (overlaps, transverse load on truss, concrete strength, surfaces); partly overlaps Rust pre-solve gates |
| `model-findings.ts` | 168 | d | - | low | Sort/merge/format engine structured diagnostics for UI |
| `model-takeoff.ts` | 169 | c | - | medium | Material takeoff: member area*length, shell area*thickness by material, steel ratio; drawn-area catch->null falls back |
| `moving-loads-3d.ts` | 222 | b | solver/moving_loads.rs solve_moving_loads_3d | high | TS sweep of train positions over WASM 3D load session with station extraction (Rust routine only reads end forces); per-position catch counted in failed |
| `moving-loads.ts` | 761 | b | solver/moving_loads.rs solve_moving_loads_2d | high | 2D moving-load sweep and pointwise envelope in TS over WASM load session; kinematic refusal; mechanism check skipped if kinematics throws |
| `nodes-on-members.ts` | 49 | d | - | medium | Detects nodes lying on members without a cut (disconnected structure hint) |
| `orphan-rotations-2d.ts` | 154 | d | solver/assembly.rs (orphan rotation guard) | medium | Merge all-hinged joints / restrain orphan rotations in 2D input before eigen analyses |
| `orphan-rotations-3d.ts` | 320 | d | solver/assembly.rs (orphan rotation guard) | medium | Adds vanishing springs/restraints for unresisted 3D rotations; unheld nodal moment check; axes catch->null |
| `pdelta-forces.ts` | 123 | b | solver/pdelta.rs + geometric_stiffness.rs | high | Rewrites WASM P-Delta member forces adding Kg(N)*u in TS (engine reports K*u only); B2 amplification; TS replaces Rust force output by design |
| `pdelta-result.ts` | 5 | d | - | low | Formats B2 factor (null = infinite) |
| `plastic-collapse.ts` | 413 | b | solver/plastic.rs solve_plastic_2d | high | TS event-to-event plastic collapse with WASM linear solves; any solve()/kinematics throw is recorded as mechanism (collapse) rather than error |
| `plastic-moments.ts` | 198 | a | section analyze_section_plastic | high | Mp=fy*Zp with Zp from WASM section engine; on throw falls back to declared/estimated Zp (source tagged 'rectangle'/'estimated'); DEFAULT_FY=250 |
| `prestress.ts` | 87 | b | solver/prestress.rs prestress_fef_3d | high | Parabolic tendon equivalent loads (8Pe/L^2, end forces) computed in TS and sent as ordinary loads |
| `pro-report-inputs.ts` | 593 | d | - | medium | Gathers report data: joints, frame lines, envelope, bar marks, quantities, drifts, crack width via other modules |
| `pro-report.ts` | 1557 | c | postprocess/cirsoc201_check.rs (slab flexure) | high | HTML/KaTeX report; but slab reinforcement section designs As from hard-coded q=10 kN/m2, Mu=qL^2/10 (0.8 for other dir), ignoring analysis results |
| `pushover-curve.ts` | 163 | d | - | medium | Capacity curve: cumulative sums of engine increment displacements/reactions per hinge event, frames for playback |
| `pushover-pattern.ts` | 65 | c | - | medium | Lateral pushover patterns (uniform/triangular/modal by gravity weight, normalised to 1 kN) and target truncation |
| `quantities.ts` | 77 | c | - | low | Rebar takeoff by diameter (length, mass) plus model takeoff aggregation |
| `reinforcement-svg.ts` | 1504 | c | postprocess/cirsoc201_check.rs | high | Mostly SVG drawings, but designSlabReinforcement does TS CIRSOC 201 slab flexure (Rn, rho, AsMin 0.0018, bar spacing) |
| `report/calc-report-extra.ts` | 334 | d | - | low | Calc report HTML: kinematics section, force tables, extremes along members from diagram evaluators |
| `report/model-figure.ts` | 125 | d | - | low | Numbered model SVG figure for the report |
| `report/project-sections.ts` | 113 | d | - | low | Report cover, envelope, statics, deflection and figure HTML sections |
| `report/quantities-section.ts` | 40 | d | - | low | Quantities section HTML |
| `result-query.ts` | 186 | d | - | low | Pure selectors over 3D element end forces: extremes, thresholds, CSV |
| `result-scopes.ts` | 212 | d | - | medium | Which combinations count and named envelopes; envelopes via WASM computeEnvelope3D + shell envelope |
| `result-tables.ts` | 230 | d | - | low | Multi-combination result tables, summary/envelope rows, max-by-type, CSV |
| `result-types.ts` | 258 | d | - | low | Shared result type definitions; also getSpectralAcceleration interpolation helper (TS) |
| `rigid-diaphragm.ts` | 196 | b | solver/constraints.rs Constraint::Diaphragm | medium | Rigid diaphragm via stiff penalty beams (x1e6); appears unused (no importers) while Rust has a real diaphragm constraint |
| `section-stress-3d.ts` | 829 | a | postprocess/section_stress_3d.rs | high | WASM computeSectionStress3D when ready; full TS fallback (biaxial Navier, shear, torsion) when !isWasmReady plus legacy quick-compute for colour map: silent TS replacement |
| `section-stress.ts` | 1493 | a | postprocess/section_stress.rs | high | WASM computeSectionStress2D when ready; otherwise full TS Navier/Jourawski/Mohr/failure fallback silently; central core, shear flow in TS only |
| `section-teaching.ts` | 311 | b | section/ (centroid, shear centre) | low | Pedagogical step-by-step centroid and shear centre working, re-deriving what the section engine computes |
| `seismic-drift.ts` | 48 | c | - | high | INPRES-CIRSOC 103 §6.4 story drift d_u=Cd*de/gr and Tabla 6.4 limits |
| `self-weight.ts` | 133 | c | - | high | Self-weight loads per case/direction/factor/scope for members, plates, quads sent to solver |
| `settlement-case.ts` | 144 | a | postprocess/combinations.rs (combine_results/envelope) | high | Solves imposed displacements once and adds once per combination via WASM combine/envelope; fixes double counting |
| `shell-combination-kernel.ts` | 82 | a | shell_combination_kernel.rs combine_shell_stresses | high | Registry and packed Float64 boundary for the Rust shell combination kernel |
| `shell-combos.ts` | 214 | b | shell_combination_kernel.rs combine_shell_stresses | high | Uses registered Rust kernel, else full TS recombination + envelope of shell stresses silently when kernel not registered |
| `shell-contour-field.ts` | 58 | d | - | low | Corner value field and range for shell contours |
| `shell-family-selector.ts` | 358 | d | - | low | Heuristic recommendation of shell element family by geometry/thickness |
| `shell-line.ts` | 55 | d | - | low | Samples a shell result along a line by barycentric interpolation |
| `shell-load-integration.ts` | 503 | b | element/quad.rs quad_pressure_load, element/plate.rs plate_pressure_load | high | Area-load nodal forces Fi=d*int(Ni q dA) for MITC4/DKT, extended to variable/partial/frame loads in TS |
| `shell-mesh-gen.ts` | 122 | d | - | low | Bilinear structured quad mesh generation |
| `shell-offsets.ts` | 139 | d | - | high | Shell offsets via helper nodes + eccentric constraints in solver input |
| `shell-results.ts` | 158 | b | shell_combination_kernel.rs (principal/von Mises) | medium | Shell centre rows: face stresses membrane+-6M/t^2, principals, von Mises, Tresca, global rotation in TS |
| `shell-stress.ts` | 212 | b | shell_combination_kernel.rs (principal/von Mises) | medium | Principal stresses, von Mises, Tresca, face stresses for shells computed in TS |
| `sliding-joints.ts` | 124 | d | - | high | 2D sliding joints via helper nodes + MPC constraints in solver input |
| `solve-diagnostics.ts` | 91 | d | - | medium | Reports solver/model diagnostics to toasts, non-finite gate shared by Education |
| `solve-finish.ts` | 28 | d | - | high | Post-solve finishing of 3D results (strip stabilised reactions, give back axial shares) shared by main thread and worker |
| `solver-detailed-3d.ts` | 1079 | b | solver/linear.rs + assembly.rs | medium | Full TS 3D DSM solver capturing steps for teaching; independent from Rust solve |
| `solver-detailed.ts` | 853 | b | solver/linear.rs + assembly.rs | medium | Full TS 2D DSM solver with equivalent loads for step display; independent from Rust solve |
| `solver-pool.ts` | 339 | a | solver/ (via worker WASM instances) | high | Worker pool for WASM solves; PoolUnavailableError lets callers fall back to sync WASM solve (comment notes caller fallback swallows throws) |
| `solver-service.ts` | 2893 | a | solver/ (solve_2d/solve_3d via wasm-solver) | high | Main solve pipeline: builds SolverInput 2D/3D (loads, self-weight, offsets, releases), calls WASM/worker pool; mixes TS load assembly (c) with WASM solve |
| `solver-shells.ts` | 243 | c | - | high | Shell surface/thermal load conversion, plate/quad self-weight nodal loads, Gauss corner shares; feeds loads applied to model |
| `solver-worker.ts` | 86 | a | solver/ (solve_2d/solve_3d/pdelta_3d) | high | Web worker running WASM solves; errors returned as messages |
| `spectral-case.ts` | 262 | b | solver/spectral.rs combine_srss/combine_cqc | high | Response-spectrum case: per-mode coefficients Sa/omega2*Gamma, SRSS/CQC/ABS modal + 100/30 or SRSS direction combination done in TS on WASM unit solves; user spectrum parsing/interpolation |
| `stabilised-reactions.ts` | 27 | d | - | medium | Filters reactions of auto-added vanishing rotational springs from results |
| `statics-check.ts` | 350 | c | - | medium | Equilibrium residual: sum of applied loads vs reactions per case/combo (diagnostic, recomputes applied load resultants in TS) |
| `station-buffer.ts` | 33 | a | postprocess/beam_stations.rs (extract_beam_station_buffer_3d) | high | Decodes versioned Float64 station buffer from WASM into station results; throws on malformed data |
| `station-design-forces.ts` | 2783 | b | postprocess/design_demands.rs, beam_stations.rs; rc_check.rs/cirsoc201_check.rs | high | Known dup: station force extraction, governing demands, phiMn/phiVn/column capacity (column via Rust kernel), anchorage Ld, bar layout/spacing per CIRSOC 201 |
| `station-forces.ts` | 124 | b | postprocess/beam_stations.rs / diagrams_3d.rs (evaluate_diagram_3d_at) | high | Critical stations and interior forces via TS evaluateDiagramAt (diagrams-3d.ts); used by design JS fallback and forces report |
| `steel/flange-local-buckling.ts` | 153 | c | - | medium | CIRSOC 301 F.6.2 minor-axis flange local buckling branch selection/report (lambda_f vs lambda_pf/lambda_rf, Mn formula) |
| `steel/grade-family.ts` | 86 | d | - | low | Resolves declared grade to material family via catalogue lookup |
| `steel/material-family.ts` | 200 | c | - | high | Classifies material as concrete/steel/etc from fy magnitude and E band thresholds; gates which checker runs |
| `steel/moment-gradient.ts` | 225 | c | - (steel_check.rs takes Cb as input) | high | Cb per CIRSOC 301 F.1.1 from unbraced-segment moment diagram, applicability refusals; raises LTB capacity |
| `steel/profile-optimise.ts` | 183 | d | - | high | Lightest catalogue profile search calling TS checkSteelMember (cirsoc301.ts); search only |
| `steel/section-constants.ts` | 120 | c | - (section/torsion.rs FE J used when available) | high | J, Cw, Zx, Zy, c closed-form for I/H/channel sections fed to CIRSOC 301 checker |
| `steel/steel-inventory.ts` | 297 | d | - | low | Inventory of metallic members, families, empty reasons, total length |
| `steel/steel-status.ts` | 163 | d | - | medium | Steel member status union, invariants, display tone/labels (what may be called verified) |
| `steel/torsional-buckling.ts` | 177 | c | - | low | CIRSOC 301 E.4 applicability/gap report; computes shear modulus G only |
| `steel/unbraced-length.ts` | 163 | c | - | high | Member chain length L and unbraced length Lb from collinear elements/constraint nodes; feeds LTB/compression checks |
| `steel/workflow-assumptions.ts` | 189 | d | - | low | Per-member assumption rows with provenance |
| `steel/workflow-rows.ts` | 405 | d | - | low | Grade/section stage rows, missing data, governing thickness lookup |
| `step-by-step-scope.ts` | 38 | d | - | low | Decides if step-by-step wizards can represent the model (DOF limit, no shells/constraints) |
| `steps/beam-line.ts` | 223 | c | - | low | Teaching: reads beam into spans/overhangs, load positions and resultants |
| `steps/castigliano.ts` | 467 | b | solver/ linear 2D solve (teaching re-derivation) | low | Teaching: Castigliano redundants/displacements via force-method; compared to WASM reference |
| `steps/continuous-common.ts` | 526 | b | solver/ linear 2D solve (teaching) | low | Teaching: continuous-beam span reactions, V/M diagrams from method's own numbers, piece integration |
| `steps/cross-beams.ts` | 312 | b | solver/ linear 2D solve (teaching) | low | Teaching: Hardy Cross moment distribution (stiffness, DF, FEM, cycles) |
| `steps/cuts-segments.ts` | 343 | b | postprocess/diagrams.rs (teaching) | low | Teaching: N/V/M polynomials per segment, extrema, diagrams |
| `steps/cuts-statics.ts` | 664 | b | solver/ linear 2D solve (teaching) | low | Teaching: reactions by equilibrium, member end forces by cuts, joint check |
| `steps/deformation-common.ts` | 588 | b | solver/ + diagrams.rs deflection (teaching) | low | Teaching: curvature integration, Gauss product integrals, unit-load member work, max deflection |
| `steps/doc.ts` | 82 | d | - | low | StepDoc data types |
| `steps/double-integration.ts` | 279 | b | solver/ linear 2D solve (teaching) | low | Teaching: EI v''=M with Macaulay brackets, reactions as unknowns |
| `steps/dsm-extras.ts` | 119 | d | - | low | Teaching blocks: static classification formula, DOF sketch, fixed-end action blocks |
| `steps/fem.ts` | 212 | b | element/ fixed-end forces (teaching) | low | Teaching: fixed-end actions table formulas for span loads |
| `steps/format.ts` | 108 | d | - | low | Number formatting to KaTeX/plain text |
| `steps/frames-common.ts` | 737 | b | solver/ linear 2D solve (teaching) | low | Teaching: frame shears/axials/reactions from end moments, diagrams, comparison |
| `steps/methods/continuous.ts` | 14 | d | - | low | Registers continuous-beam methods |
| `steps/methods/core.ts` | 36 | d | - | low | Registers DSM/flexibility methods applicability |
| `steps/methods/cuts.ts` | 98 | d | - | low | Cuts method orchestration/registration |
| `steps/methods/deformation.ts` | 38 | d | - | low | Registers deformation/energy methods |
| `steps/methods/frames.ts` | 525 | d | - | low | Registers frame methods (moment distribution, slope-deflection) wrapper |
| `steps/methods/index.ts` | 16 | d | - | low | Method catalog index |
| `steps/methods/trusses.ts` | 26 | d | - | low | Registers truss methods |
| `steps/moment-area.ts` | 247 | b | solver/ + diagrams.rs (teaching) | low | Teaching: moment-area theorems on determinate beams |
| `steps/narrow-tex.ts` | 235 | d | - | low | KaTeX line breaking for narrow panels |
| `steps/plane-model.ts` | 181 | d | - | low | Solver 2D input re-expressed for hand methods (names, cosines, EI/EA unit conversion) |
| `steps/reference.ts` | 63 | a | solver/ solve_2d via wasm-solver | low | WASM matrix solve read into document conventions for comparison tables |
| `steps/registry.ts` | 72 | d | - | low | Method catalog registry |
| `steps/sketch.ts` | 81 | d | - | low | Figure data types |
| `steps/sway-modes.ts` | 253 | b | solver/ linear 2D solve (teaching) | low | Teaching: sway-mode nullspace (rref), joint loads, mode virtual work, dense solve |
| `steps/three-moments.ts` | 406 | b | solver/ linear 2D solve (teaching) | low | Teaching: Clapeyron three-moment equations solved |
| `steps/truss-common.ts` | 512 | b | solver/ linear 2D solve (teaching) | low | Teaching: truss reactions/global equilibrium, dense solve, determinacy |
| `steps/truss-compatibility-solve.ts` | 389 | b | solver/ linear 2D solve (teaching) | low | Teaching: compatibility-matrix stiffness solve K=AtkA, end forces, reactions (agrees with engine) |
| `steps/truss-compatibility.ts` | 449 | d | - | low | Teaching document writer for compatibility method (numbers from -solve) |
| `steps/truss-joints.ts` | 250 | b | solver/ linear 2D solve (teaching) | low | Teaching: method of joints |
| `steps/truss-sections.ts` | 269 | b | solver/ linear 2D solve (teaching) | low | Teaching: method of sections (Ritter), cut finding, line intersections |
| `steps/virtual-work.ts` | 107 | b | solver/ (teaching) | low | Teaching: unit-load displacement via force-method primary |
| `story-drift.ts` | 93 | c | - | high | Inter-story drift on columns (Z-up levels, per-column relative displacement / height); feeds drift verification |
| `structural-graph.ts` | 245 | d | - | low | Node connectivity, beam-column joints, frame lines for RC detailing |
| `support-dofs-3d.ts` | 47 | d | - | medium | Support type to restrained DOFs in 3D solver frame |
| `thermal-alpha.ts` | 58 | c | - | high | Material thermal expansion coefficient and scale factor applied to thermal loads sent to engine (engine assumes 12e-6) |
| `torsion-flow.ts` | 484 | b | postprocess/section_stress_3d.rs torsion_shear (Bredt); section/torsion.rs | medium | Torsional shear stress by theory (open thin-wall, Bredt closed, solid) and theory comparison for stress panel |
| `transverse-sign-2d.ts` | 79 | d | - | medium | Sign flips between solver and drawn transverse axis for 2D forces/envelopes |
| `types-3d.ts` | 624 | d | - | low | 3D solver types |
| `types.ts` | 368 | d | - | low | 2D solver types |
| `variable-members.ts` | 523 | a | solver/ (prismatic pieces solved in WASM) | high | Splits variable-section members into prismatic pieces for solve and collapses results/envelopes/modes back (TS segmentation + WASM solve) |
| `vehicles.ts` | 250 | c | - | high | AASHTO design vehicles, variable axle spacing, wheel-line split, vehicle position load cases for moving loads |
| `verification-service.ts` | 925 | b | postprocess/beam_stations.rs (JS fallback); steel_check.rs (runs TS cirsoc301 instead) | high | Verification orchestration: WASM station extraction with JS fallback, governing demands, CIRSOC 201 via auto-verify, CIRSOC 301 steel via TS checker, steel demand/segment diagram mapping, Cb |
| `warping.ts` | 274 | b | section/warping.rs solve_warping (partial) | medium | Closed-form warping constant/class and non-uniform torsion response (bimoment, lambda) for display |
| `wasm-solver.ts` | 2047 | a | engine/src/lib.rs exports | high | WASM boundary: serialization, finite-wire checks, all solve/check wrappers; design-check wrappers catch errors into null |

