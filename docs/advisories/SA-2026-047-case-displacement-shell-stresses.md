# SA-2026-047: A load case that imposed a support displacement lost its shell stresses, and combinations summed only the other cases'

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#1673](https://github.com/lambdaclass/stabileo/issues/1673) |
| Fix | #1676 |
| Affected versions | 0.2.0, 0.3.0 and 0.4.0. stabileo.com and builds of `main` from #254 (merged 2026-10-06 15:18 UTC, commits 451670e79 and 68ac49205) until #1676 (merged 2026-11-07 15:21 UTC) |
| Re-check registry | results version entry `combined-shell-stresses` |

## Affected features

- **App, 3D: a load case with an imposed displacement** (a `displacement3d` load, PRO's imposed
  support displacement per load case) in a model with plates or quads, solved with load
  combinations. The case's own results in that solve are affected too.
- A solve without combinations, which applies the imposed displacements on the supports directly,
  is not affected.
- A support's own settlement, which is not part of a load case, is not affected: it is solved
  once as the settlement case and keeps its shell stresses.

## What was wrong

#254 added displacements imposed by a load case. The app solves each case's imposed displacements
on their own and adds them to the case's force results with the engine's `combine_results_3d`
(`withCaseDisplacements` in `web/src/lib/engine/solver-service.ts`). That function built every
combined result with no plate stresses, no quad stresses and no quad nodal stresses (#1673). So
the case kept its displacements, reactions and member forces, and lost all of its shell stresses:
those of its loads and those of the imposed displacement.

The app then builds each combination's shell stresses, and the envelope's, from the cases' shell
stresses. A case without any added nothing. Each combination's plate and quad stresses were the
factored sum of the other cases only, with no warning. Leaving a case out can raise or lower a
combined stress: where that case's stresses add to the others', the combined stresses and the
envelope were unconservative; where they oppose them, the reported value was too high.

## How to tell if your results are affected

Your results are affected if all of these hold:

- they were solved with a version in the range above;
- the model has plates or quads;
- a load case imposes a displacement on a node;
- the combinations were solved (Solve with load combinations defined). The load cases shown by
  that solve are affected as well as the combinations and the envelope.

In the combinations' results, that case showed no plate or quad stresses, and a combination's shell stresses did not change when
that case's factor changed.

The app names this advisory when it opens a project solved before the fix: as affected when the
model has shells and a load case that imposes a displacement, and as possibly affected when the
model has shells and none now (the project may have had one when it was solved).

## Fixed in

[#1676](https://github.com/lambdaclass/stabileo/pull/1676): the engine sums each plate and quad
stress component with the combination's factors and recomputes von Mises and the principal
stresses from the sums. The case keeps its shell stresses and the combinations include them.
`case-displacements.test.ts` checks, for quads and plates, that the case keeps its stresses and
that a 1.5 A + B combination adds 1.5 times them; it fails when the combined shells are stripped.

## Workaround

None. Solve the model again on a version with #1676.

## What to do with results you already have

Solve the combinations again and compare the plate and quad stresses of every combination with
a factor on the case that imposes the displacement, and the shell envelope.
