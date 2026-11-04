# SA-2026-012: material-nonlinear analysis reported elastic member forces after yield

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#427](https://github.com/lambdaclass/stabileo/issues/427) (NL-4 in the element-derivation review) |
| Fix | PR [#510](https://github.com/lambdaclass/stabileo/pull/510) |
| Affected versions | every version with the material-nonlinear solver (added 2026-03-06), up to 0.2.0 and `main` until the fix |
| Re-check registry | not needed: no app workflow runs this solver |

## Affected features

The material-nonlinear frame solver (`solve_nonlinear_material_2d` / `_3d`), reachable only
through the engine and its WASM API. No screen in the app calls it: the Pro tab's pushover uses
the plastic-collapse solver and its corotational option uses the geometric solver, so results
obtained in the app are not affected.

## What was wrong

After a member yielded, the solver balanced the loads with the reduced (secant) stiffness but
reported member forces computed with the elastic stiffness and the solved displacements. The
displacements and reactions were right; **the member end forces and the utilization were not those
of the solved state**:

| Cantilever 4 m, tip load 1.2·Mp/L | Base moment |
|---|---|
| Statics and the reported reaction | P·L = 1 012.5 kN·m |
| Reported member end moment before the fix | 101 250 kN·m (100×) |
| Reported member end moment after the fix | 1 012.5 kN·m |
| Reported utilization before / after the fix | ≈ 120 / 1.2 |

The error grows with 1/α (α is the post-yield stiffness ratio). Mostly an overestimate, but in an
indeterminate structure the redistribution was not reflected in the reported forces, so other
members could be reported below their real force.

## How to tell if your results are affected

You called the material-nonlinear solver directly (engine or WASM) and some member yielded. The
member end forces do not balance the reactions at a support or the loads at a node.

## Fixed in

`main` (#510); released in 0.3.0. Member forces are recovered from the
stiffness the solve balanced (the secant section of each yielded member, keeping the assembled
fixed-end and thermal forces), so they balance the reactions, and utilization is computed from
them; two regression tests pin it (`derivation_nonlinear.rs`: a yielded cantilever, and the same
with a thermal gradient). Which members yield is still decided from the elastic demand, so a member
stays yielded once it yields: that is part of the secant model, the open known issue NL-5 (#428,
the load-deflection curve also jumps at first yield), which results of this solver carry as a
warning.

## Workaround

Use the reactions and displacements, which were right, and recover member forces by statics where
possible.

## What to do with results you already have

Re-derive member forces of yielded models from the reactions or re-run on the fixed version.

## Credits and references

Found by the element-derivation review (NL-4, PR #330) and pinned by
`nl_material_2d_member_forces_balance_the_reactions`; the thermal case was found in the Codex review
of #510, and the utilization in the Codex fact-check of this advisory.
