# Refuse invalid self-weight targets

Earlier solves could omit self-weight when a saved group still named a deleted quad or an explicit member list contained a fractional ID. The reported reactions could balance because the missing weight never reached the solver. The new check refuses the solve and identifies the missing target or invalid ID. Restore the target or correct the self-weight rule before rerunning the analysis.

Each ID must be a nonnegative safe integer and must exist in the corresponding member, plate or quad list. An empty selection still contributes zero weight. An intentionally inactive member remains excluded. When an analysis subdivides a selected member, its pieces inherit the selection. A solver-generated piece cannot satisfy a reference that was missing from the original model.

The deleted-quad reproducer on origin/main returned approximately 3.5 kN of vertical reaction, from the cantilever's entered tip load and member weight alone. On the same cantilever with the fractional member selector, the planar reaction was exactly 2 kN, from the tip load alone. Both models now return a refusal. Projects with invalid self-weight targets receive a recheck notice for affected earlier analyses.
