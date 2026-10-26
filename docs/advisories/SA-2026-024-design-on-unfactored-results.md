# SA-2026-024: footings and joints were designed for the unfactored loads when the combinations had not been re-solved

| | |
|---|---|
| Severity | High |
| Status | Fixed on `main`; to be published with the next release |
| Issue | — (W2-01 in the 2026-10 audit) |
| Fix | PR [#588](https://github.com/lambdaclass/stabileo/pull/588), merged with the integration PR of #589, #590, #588 and #487 |
| Affected versions | 0.2.0 and 0.3.0 (the single result set design falls back to, `activeResultSet3D`, is in both); earlier deployments not yet bisected |
| Re-check registry | entry `design-on-unfactored-results` (models with footings or joint designs, and combinations) |

## Affected features

PRO, 3D. The designs that read one result set when no combination is solved:

- footings (the foundations of the floor families panel: `collectFootingReactions` and the
  footing run's member forces, `detailing-footing-inputs.ts`);
- joints (the Connections tab's joint design, `joint-design.svelte.ts`).

## What was wrong

When a model has combinations and none of them is solved, these designs fall back to the result on
screen, so that a model analysed under one case, with no combinations at all, can still be
designed. They also fell back when the combinations **were defined but not solved**, and then the
result on screen is every load case at factor 1 ("All loads"): **the footing or the joint was
designed for the service loads where the factored combination acts**. The footing listed the set
as "Active result set (no combination solved)", which a model with no combinations also shows; the
joint design showed nothing; neither said that the model had combinations to design for.

That state is reached in two ways:

- **live calc** (an opt-in setting, off by default): after an edit it re-solves "All loads" only
  while the single view is on screen, deliberately, for a large model's sake, so one edit after a
  full solve left the combinations unsolved;
- **a combination solve that failed** and was replaced by the single solve (said in a toast, but
  the designs read the single solve as if it were the combinations).

The size is the ratio of the load factors to 1 for the governing combination. In a 6 m × 4 m
portal with fixed feet, 20 kN/m of dead load on the beam, 15 kN of wind at the eaves and the one
combination 1.2D + 1.6W (the model of
`web/src/lib/store/__tests__/design-inputs-unsolved-combinations.test.ts`):

| Footing under the windward column | Correct (1.2D + 1.6W) | Before the fix, after a live calc |
|---|---|---|
| Vertical reaction Fz | 65.61 kN | 56.01 kN (15 % low) |

With CIRSOC 101 strength combinations the demand read is low by the combination's factors: for
dead and live load alone, between 1/1.4 and 1/1.6 of the factored demand (29 % to 38 % low). We
have not measured it on a real project.

## How to tell if your results are affected

The model is a PRO 3D model with footings or joint designs and with load combinations, and either
live calc was on, or a solve reported that its combinations failed or were refused, before the
footing or joint design was read or exported. A footing whose design lists "Active result set (no
combination solved)" while the model has combinations was designed this way.

## Fixed in

On `main` with PR #588, to ship in the next release. With combinations defined and none solved,
`activeResultSet3D` is empty (`combinationsUnsolved`): the footings and joints refuse to design,
and the floor families and Connections panels say why ("Combinations are defined and not solved…
Solve again"). A model with no combinations is still designed over its one solve. Every manual
solve (Enter, the ribbon, the exports, Calcular) solves the combinations, and "Re-run analysis
and design" fails when they were left out. Tests:
`web/src/lib/store/__tests__/design-inputs-unsolved-combinations.test.ts`,
`web/src/lib/engine/__tests__/solve-entry-point.test.ts`,
`web/src/lib/actions/__tests__/recheck-rerun.test.ts`.

## Workaround

Solve with Calcular (which solves the combinations) immediately before reading or exporting a
footing or joint design, and check that the footing lists the model's combinations, not "Active
result set (no combination solved)".

## What to do with results you already have

Re-solve and re-run the design of the footings and joints of every PRO model with combinations
that was designed with live calc on, or after a combination solve failed, and compare: a footing or
joint designed on "Active result set (no combination solved)" in a model with combinations was designed for the service
loads.

## Credits and references

Found by the 2026-10 audit of the solve path (W2-01).
