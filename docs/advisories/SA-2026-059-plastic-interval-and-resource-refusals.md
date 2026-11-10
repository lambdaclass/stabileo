# SA-2026-059: Plastic interval readings admitted outside factors and mechanism extraction discarded resource refusals

| | |
|---|---|
| Severity | Medium |
| Status | Draft 2026-11-10; fix proposed in PR #1888 |
| Issue | Found in review of PR #1888 |
| Fix | PR [#1888](https://github.com/lambdaclass/stabileo/pull/1888) (not yet merged) |
| Affected versions | Builds containing the former `plasticReading` comparison slack; mechanism resource refusals affect pre-fix PR #1888 builds introducing exact elimination budgets |
| Re-check registry | results-change entry `plastic-mechanism-refusal-propagation` |

## Affected features

Plastic collapse certificate displays in the app, and planar or spatial plastic
certification when exact mechanism elimination exceeds a resource budget.

## What was wrong

The app could label a factor outside its certified interval as inside when the
relative deviation was small. The real WASM `unconservative-cantilever.bin`
regression demonstrates a raw factor above the upper endpoint that the old
reader called inside. The engine certificate already reported that raw factor
as outside. The UI comparison did not enlarge the mathematical certificate,
but its interpretation of that certificate was wrong.

Mechanism extraction also converted exact elimination errors into an absent
mechanism. That discarded the resource reason and could let candidate search
continue or finish with a different refusal. This finding does not establish
that an unsound certificate passed the exact check; the correction makes the
resource refusal explicit and immediate.

## How to tell if your results are affected

Compare a plastic factor with both certificate endpoints directly. A factor
strictly below the lower endpoint or above the upper endpoint is outside,
regardless of the previous UI label. Resource diagnostic changes apply to the
pre-fix resource-budget implementation in PR #1888; they are not claimed to be
a released production defect.

## Fixed in

Proposed in PR #1888. Both mechanism builders propagate the elimination error,
and the app uses inclusive endpoint comparisons without a widening tolerance.
Regressions cover both mechanism builders, the actual WASM above-interval
artifact, and direct endpoint comparisons. No resource ceiling is increased.

## Workaround

Use the certificate endpoints and the engine's `solverWithinBounds` field to
check a raw factor directly. Do not interpret a resource failure as proof that
no collapse mechanism exists.

## What to do with results you already have

Re-run plastic certificates after the fix and compare the displayed factor
against the certified endpoints. Review results previously labeled inside when
the factor lay outside. Raw incremental steps and hinges retain their separate
meaning; the interval does not certify those histories.
