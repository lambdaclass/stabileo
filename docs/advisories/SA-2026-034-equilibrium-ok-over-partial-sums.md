# SA-2026-034: the equilibrium check reported agreement over loads it had left out

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-07 (fixed in 0.5.0) |
| Issue | — (review of #1077) |
| Fix | PR [#1255](https://github.com/lambdaclass/stabileo/pull/1255) (merged 2026-11-05), released in v0.5.0 |
| Affected versions | the statics panel and the PDF report since the statics check reached them, not bisected; the post-analysis report and the similar-storey scope since #1077 (2026-11-03) |
| Re-check registry | none: no solver number changes. Re-read the equilibrium verdicts of reports exported before the fix |

## Affected features

PRO's equilibrium check of each solved load case (`engine/statics-check.ts`) as three places
showed it: the report after the analysis in Diagnostics (and its CSV, PDF and Word export), the
statics panel, and the statics section of the project report. Separately, PRO's similar-storey
scope (`model/similar-storeys.ts`), added by #1077.

## What was wrong

The statics check sums each case's loads on its own, independently of the solver, and lists in
`uncovered` the loads it cannot add up: a surface load it cannot spread to nodes, or a load type it
does not read. Temperatures, prestress and imposed displacements are not in that list: they have
no net external force, and their reactions balance on their own.

A case was called balanced whenever the relative residual over the loads the check did add was
below 1·10⁻⁶. With a load left out, that residual says nothing about the load left out. The
report after the analysis then said "loads and reactions agree", the statics panel "balances",
and the project report printed a tick, for a case whose check had not included every load.

| Case | Residual over what was summed | Left out | Before the fix | After |
|---|---|---|---|---|
| D, every load read | 1·10⁻⁹ | — | agree | agree |
| S, one surface load not spread | 1·10⁻⁹ | `surface3d` | agree, ✓ | not fully checked, `surface3d` named |
| W, a load left out and out of balance | 2 % | `surface3d` | does not balance | does not balance, `surface3d` named |

The report after the analysis also left out the line for the cases that balanced as soon as any
other case did not.

In the similar-storey scope, a member's counterpart on another storey was found by position
alone, so a frame member and a truss at the same place stood for each other: an edit or a
deletion made with the scope on similar or all storeys reached the member of the other type. A
member drawn on one storey was copied to the others with its type, material and section only:
its end releases, joints, offsets, local axes, behaviour and design data were dropped, so a
pinned beam was copied as a rigid one. A storey the copy could not reach was skipped silently.

## How to tell if your results are affected

In a report exported before the fix, a case marked balanced whose row in the statics panel now
reads "not fully checked": its equilibrium was not verified for the loads named there. For the
storey scope: members of a different type at the same place as one edited or deleted with the
scope on similar or all storeys, and members copied to other storeys whose end releases differ
from the one drawn.

## Fixed in

0.5.0.

PR #1255. A case balances only with every load in the sum (`staticsVerdict`): otherwise it is
"not fully checked", with the loads left out named, in the report after the analysis, the statics
panel and the project report; the cases that balance are reported even when others do not.
Members are matched across storeys by type as well as place; a copy keeps every property of the
member but its name, the tag of the arc it was drawn in and its references to other objects, drops the unbraced length and the
bracing (stated in metres along the member) when its length differs, and the storeys it could
not reach are reported. Regression tests: `post-analysis.test.ts`, `statics-verdict.test.ts`,
`similar-storeys.test.ts`, `storey-scope.test.ts`.
