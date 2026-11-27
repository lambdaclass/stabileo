# Refuse invalid self-weight targets

Earlier solves could omit self-weight when a saved group still named a deleted quad or an explicit member list contained a fractional ID. The reported reactions could balance because the missing weight never reached the solver. The new check refuses the solve and identifies the missing target or invalid ID. Restore the target or correct the self-weight rule before rerunning the analysis.

Each ID must be a nonnegative safe integer and must exist in the corresponding member, plate or quad list. An empty selection still contributes zero weight. An intentionally inactive member remains excluded. When an analysis subdivides a selected member, its pieces inherit the selection. A solver-generated piece cannot satisfy a reference that was missing from the original model.

The deleted-quad reproducer on origin/main returned approximately 3.5 kN of vertical reaction, from the cantilever's entered tip load and member weight alone. On the same cantilever with the fractional member selector, the planar reaction was exactly 2 kN, from the tip load alone. Both models now return a refusal. Projects with invalid self-weight targets receive a recheck notice for affected earlier analyses.

## Capture projected self-weight with the solve mesh

When an asynchronous spatial solve uses an already projected model, the solve snapshot now captures the original member, plate, quad and group lookups along with every level of member replacements. Source edits cannot change the captured load selection or make an originally invalid target valid. This covers single nonlinear solves, nonlinear combinations and per-combination P-Delta on both WASM dispatch paths.

In review of PR #2577, clearing the selected group between snapshot capture and load assembly gave approximately 10 kN of vertical reaction on the PR parent, accounting for the tip force alone. The updated snapshot gives 11.62495 kN, including the selected member's full 1.62495 kN of weight across its four segments. A new solve after clearing the group gives approximately 10 kN. The snapshot defect was introduced by the projection in this PR. On origin/main the same subdivided model returned about 10.40624 kN even without the edit, because the group selected only the first of the four segments.

## Recheck saved results from scoped member self-weight

The solve stamp records which analyses ran, but carries no record of temporary member subdivision. The notice therefore also covers earlier results from projects with a nonzero self-weight rule that selects members through a valid group or explicit list. A whole-model rule, empty selection or shell-only selection does not trigger the subdivision notice. Rerun the affected analysis to apply each selected member's weight to all of its segments.
