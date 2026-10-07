# PRO — 24: cases and combinations

Branch `feat/pro-24-cases-combinations`, on `feat/pro-23-shell-area-loads`. Everything is in the
application layer; the engine is untouched.

## The case as solved

- `LoadCase` gains `includes` (cases taken in with factors), `reference`, `solve`, `notional`
  (source case, ratio, direction) and `reduction` (ratio and the inputs it came from).
  `LoadCombination` gains `method` (`linear`, `srss`, `abs`). The store writes them with
  `updateLoadCaseFields` and `updateCombination`; removing a case takes it out of the others'
  `includes` and `notional`.
- `engine/case-effects.ts` `withCaseEffects`: the model with every case's loads and self-weight
  rows written out, in dependency order. A reduction scales the case's own loads; a notional case
  reads its source's solver loads through `direct-analysis.ts` `nodeGravity` and `notionalLoads`; an
  included case brings its effective loads and its self-weight rows times the factor. A loop
  (`caseOrder`) takes nothing in. With no case saying any of it, the model is returned as it is.
- Applied in `solveCombinations3D` and `solveCombinations3DParallel` (every per-case path:
  linear, P-Delta per combination, nonlinear), `runDirectAnalysis`, `withMassSource`, the load
  table's case totals and the load at a slab–column joint (`detailing-footing-inputs.ts`
  `nodalLoadAtJoint`). A notional case reads its source on the expanded model (a member of variable
  section as its pieces), the interior nodes' share going to the member's own ends.
- A case may not read itself: `updateLoadCaseFields` refuses a loop through `includes` or a
  notional source, the case details offer no such case, and a loop from a file is a model finding
  (`MODEL_CASE_LOOP`) and a badge. Deleting a case names the composite cases it leaves and the
  notional cases it leaves empty (`caseDeletionScope`). `duplicateCase` copies `includes`,
  `notional`, `reduction`, `reference` and `solve`.
- A composite case is not an action of its type (`combination-cases.ts` `isCompositeCase`): the
  generator, the mass presets, the older self-weight switch and the service gravity sum leave it
  out; the case details say so when one is typed.
- Direct analysis: a combination that takes notional cases has its notional loads in them, adds
  none of its own and does not read theirs as its lateral load (`direct.dir.cases`).
- The hand reduction (`engine/loads/case-reduction.ts`): L only, Lo and the exclusions of
  §4.7.3–4.7.5 and Table 4.1 note (a) from the occupancy named, refused on a case holding loads the
  generator reduced.

## Which cases, and SRSS and ABS

- `engine/combination-methods.ts`:
  - `casesToSolve`: cases listed (not reference, `solve` not false) or taken by a combination.
  - `magnitudeCombination`: each case once with its factors added, scaled in TS (`scaledResult`:
    displacements, reactions, member forces with their loads and a variable member's pieces, shell
    stress components; the engine's combiner dropped stresses and pieces), plus the settlement case
    once at factor 1, combined quantity by quantity; member end forces too, and
    `ElementForces3D.combined` keeps the parts so `diagrams-3d.ts` `evaluateDiagramAt` combines
    point by point along the member. A shell's σ1, σ2 and Von Mises are recomputed from the
    combined components (worse face for a plate, membrane for a quad), as a linear combination's
    are: a value of the magnitudes, not a stress state. The result says `magnitude: { method }`.
  - `finishBundle`: magnitude combinations replaced, the envelope over the linear ones (or over the
    listed cases when there are none), unlisted cases removed from `perCase`. With P-Delta per
    combination the magnitude is the linear cases' and says `firstOrder` (the combinations list
    says so too); one the P-Delta solve found unstable gets no result. The P-Delta path solves the
    settlement case for them when there is one.
  - `magnitudeRefusal`: a nonlinear model (one-way members, lifting supports, support curves)
    refuses SRSS and ABS combinations by name (`svc.magnitudeNonlinear`).
- Out of everything that needs a sign or an equilibrium, in one place: `result-scopes.ts`
  `isMagnitudeCombination` in `designComboIds` / `activeComboIds` (a stated list naming one too),
  so `activePerCombo3D` / `activeCombinations` (design, station demands, governing — also from the
  live calc —, joints, footings, floors, the forces report, the Excel combination sheet, the PRO
  report) never read one. Envelopes over results skip a result flagged `magnitude`
  (`envelopeOver`, `envelopeMembers`: named envelopes, the service deflection sets). A stated list
  naming only magnitudes gives the listed cases' envelope, as `finishBundle` does without a linear
  combination. The statics check leaves them out and names them (`statics-rows.ts` `magnitude`).
  The project workbook lists them under the source kind `magnitude` and out of its maxima and
  envelope. The result tables' "all" basis still lists them with the others.
- The statics check reads the cases as solved (`withCaseEffects`), and a combination's unlisted
  cases (reference, not solved alone) by their applied side.

## Types, generator options

- Case types N, Cr, Tr, M, A, I with categories (`codes/families/origin.ts`, `cirsoc.ts`). In the
  automatic combinations Cr and Tr combine as L (`combination-cases.ts` `symbolOfType`); N enters
  through `engine/loads/notional-combinations.ts` `withNotionalVariants`; M, A and I are rule
  symbols no code rule names, so they enter through the project's rules only. Under CIRSOC 103 a
  mass case (M) weighs whole; Cr and Tr are not mass.
- The combination generator (`ProLoadsTab.svelte`) can add notional variants (to strength
  combinations only) and write the result as composite cases (`store/generated-combinations.ts`
  `addCompositeCases`), each with a combination taking it at factor 1, filed through
  `addGeneratedCombinations` with the replaced combination's origin and purpose, so the solve, the
  results and design see them as they saw the combinations.
- Changing a code combination's method marks it edited (`updateCombination`).
- UI: `components/pro/loads/ProCaseDetails.svelte` (⚙ in each case row), badges in the case table,
  a notional-cases block, the method selector in `ProCombinationsList.svelte`.

## Tests

- `engine/__tests__/case-composition.test.ts`: a composite case against the linear combination,
  with P-Delta per combination against its parts, a reference and an unsolved case out of the
  results, a loop, a notional case's total and its variants, a reduced case, SRSS and ABS at a node
  and along a member.
- `engine/__tests__/case-composition-magnitude.test.ts`: SRSS and ABS out of design (a column's
  axial sign, the station demands, the governing search, a stated list), the statics check (left
  out; composite, reduced and reference cases read as solved), P-Delta and nonlinear, the
  settlement, a case named twice, shell stresses, a variable member's pieces, envelopes and the
  service sets, notional variants and service combinations, the workbook's `magnitude` kind, the
  method edit marking a code combination, composite cases reaching design.
- `engine/__tests__/case-composition-cases.test.ts`: a notional case on a tapered member, a
  composite case typed D (generator, mass rule, self-weight), the hand reduction's examples, M, A
  and I through a rule, the single solve. `direct-analysis-notional-cases.test.ts`: notional cases
  in the direct analysis either side of Δ₂/Δ₁ = 1.7. `store/__tests__/load-ops-cases.test.ts`,
  `footing-joint-cases.test.ts`, `service-deflection-composite.test.ts`.
- `e2e/pro-case-composition.spec.ts` (`@smoke`).

## Not done here

- The single solve of every load (no combinations) adds every case's own loads once, a reduced
  case's reduced and a reference case's left out (`case-effects.ts` `singleSolveModel`); notional
  loads are not worked out there.
- The deformed shape of an SRSS or ABS combination joins its combined node values; such a
  combination does not enter the linear envelope.
- Design modules read composite cases through the combination the generator writes for each; the
  case itself carries no combination origin, so "replace generated loads" takes back the
  combination and leaves the case.
