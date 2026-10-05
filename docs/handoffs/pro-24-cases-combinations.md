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
  linear, P-Delta per combination, nonlinear), `runDirectAnalysis`, `withMassSource`, and the load
  table's case totals.

## Which cases, and SRSS and ABS

- `engine/combination-methods.ts`:
  - `casesToSolve`: cases listed (not reference, `solve` not false) or taken by a combination.
  - `magnitudeCombination`: the factored cases (`combineResults3D` with one case) combined quantity
    by quantity; member end forces too, and `ElementForces3D.combined` keeps the parts so
    `diagrams-3d.ts` `evaluateDiagramAt` combines point by point along the member.
  - `finishBundle`: magnitude combinations replaced, the envelope over the linear ones (or over the
    listed cases when there are none), unlisted cases removed from `perCase`.
- `result-scopes.ts` `scopeBundle3D` leaves magnitude combinations out of a scoped envelope.

## Types, generator options

- Case types N, Cr, Tr, M, A, I with categories (`codes/families/origin.ts`, `cirsoc.ts`). In the
  automatic combinations Cr and Tr combine as L (`combination-cases.ts` `symbolOfType`); N enters
  through `engine/loads/notional-combinations.ts` `withNotionalVariants`; M, A and I through the
  project's rules only.
- The combination generator (`ProLoadsTab.svelte`) can add notional variants and write the result as
  composite cases (`store/generated-combinations.ts` `addCompositeCases`).
- UI: `components/pro/loads/ProCaseDetails.svelte` (⚙ in each case row), badges in the case table,
  a notional-cases block, the method selector in `ProCombinationsList.svelte`.

## Tests

- `engine/__tests__/case-composition.test.ts`: a composite case against the linear combination,
  with P-Delta per combination against its parts, a reference and an unsolved case out of the
  results, a loop, a notional case's total and its variants, a reduced case, SRSS and ABS at a node
  and along a member.
- `e2e/pro-case-composition.spec.ts` (`@smoke`).

## Not done here

- The single solve of every load (no combinations) still adds every case's own loads once, a
  reference case's included.
- The deformed shape of an SRSS or ABS combination joins its combined node values; such a
  combination does not enter the linear envelope.
- Design modules read composite cases as cases; a composite case created from a code combination
  carries no combination origin.
