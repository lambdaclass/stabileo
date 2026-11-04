# SA-2026-014: 3D plastic collapse factor depended on element numbering (up to 2.4× the collapse load)

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#511](https://github.com/lambdaclass/stabileo/issues/511) |
| Fix | PR [#524](https://github.com/lambdaclass/stabileo/pull/524) |
| Affected versions | every version with 3D plastic collapse (pushover), up to 0.2.0 and `main` until the fix |
| Re-check registry | `plastic-3d-element-order` (models with members, after a plastic collapse analysis) |

## Affected features

3D plastic collapse (`solve_plastic_3d`): the pushover of the Pro tab, the engine and its WASM
API. 2D plastic collapse is not affected.

## What was wrong

Before each load increment the event-to-event solver looks for a consistent set of active
hinges: a hinge whose rotation would turn backwards closes, and a closed one still on the yield
surface that would be pushed outward reopens. A 3D hinge holds the moment vector it formed with
and frees both bending rotations, so under biaxial bending these checks can cycle: closing one
hinge drives another out of the yield surface, reopening it turns the first one backwards
again. The solver then went on from whichever state of the cycle it was left in, and which
state that was depended on the order the hinges were visited, that is, on the element
numbering. From an inconsistent state a closed section was pushed through the yield surface
(the event search sees no yield ahead of a section already on it and moving out), so the next
events, and whether the state was read as a mechanism, came from an inadmissible moment field.
Interior hinges that formed a few millionths of the length from an existing hinge added a
sliver element whose stiffness swamped the solve in round-off, a second way for the numbering
to decide the next events.

The same structure, renumbered, reported very different collapse factors. The differential
model frame3d-2 (10 members, a point load on one member, settlements), f_y = 250:

| frame3d-2 | Collapse factor |
|---|---|
| Certified collapse factor (static and kinematic bounds, exact arithmetic) | 176.47 |
| Reported before the fix, depending on the numbering | 75.87, 101.7, 145.9, 175.8, 224.8, 241.1 or 424.3 |
| Reported after the fix, every numbering | 73.71 (lower bound, with a warning) |

424.3 is 2.4 times the collapse load. Every value before the fix carried the warning "the
collapse factor is not guaranteed", but the same warning also accompanied the values below the
collapse load, and the result did not say which. A second corpus model (pdelta3d-1, certified
collapse factor 15.748) reported between 13.65 and 15.79 depending on the numbering.

## How to tell if your results are affected

A 3D plastic collapse (pushover) result that carried the warning "a hinge rotation reversed and
no consistent set of active hinges was found", or "the final moment field exceeds the yield
surface". Results without those warnings did not go through the cycle. Results obtained after
PR #510 also carried the known-issue notice PC-3D (#511) on every 3D plastic collapse.

## Fixed in

`main` (#524); released in 0.3.0.

- When no consistent set of active hinges exists, the analysis stops at the last consistent
  state and reports that load factor with a warning and `isMechanism = false`. Its moment field
  is in equilibrium with the loads and on or inside the yield surface everywhere, so the factor
  is a lower bound of the collapse load (static theorem); the collapse load may be higher
  (frame3d-2: 73.71 against 176.47).
- Every choice among hinges is made by rate (the section reaching the yield surface first, the
  hinge turning backwards or loaded outward the most), never by element number.
- A span peak within 0.1 % of the member length of a hinge of the member (one formed in the
  span, or a hinged end) is that hinge's peak moved, not a new hinge cutting a sliver of the
  member; beside an open hinge the result says so ("the moment peak moves along a member").

Regression tests: `plastic_3d_collapse_factor_does_not_depend_on_numbering` (six corpus models,
16 renumberings each, the factor identical and below the certified one unless the result says it
is approximate), `plastic_3d_frame3d_2_is_a_lower_bound_of_its_certificate` (the certificate of
the same structure, 176.47, and the solver's 73.71 below it) and
`space_portal_collapse_factor_does_not_depend_on_numbering` (hand values of a space portal under
12 renumberings).

## Workaround

Until the fix is released: use the certified plastic collapse (`certify_plastic_3d`), which
encloses the collapse factor by the two plastic theorems in exact arithmetic, or check the
governing mechanism by hand. Do not use a 3D result that carries either warning above.

## What to do with results you already have

Re-run 3D plastic collapse analyses whose result carried the warnings above on the fixed
version. A factor above the new one is not supported by the analysis; use the new factor (a
lower bound) or a certified or hand value.

## Credits and references

Found by the metamorphic relabel check (`metamorphic_pr_3d`, intermittent before map iteration
was made ordered in #328); the certified value comes from `certify::plastic_3d` on the same
structure with rational local axes.
