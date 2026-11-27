# SA-2026-124: Scoped self-weight could omit part or all of a load

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2565](https://github.com/lambdaclass/stabileo/issues/2565) |
| Fix | PR [#2577](https://github.com/lambdaclass/stabileo/pull/2577), merged as `6b47ae936` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Self-weight scopes date to the first numbered release, 0.2.0 (`9d464a1ae`). The separate planar analysis subdivision dates to 0.5.0 (`97ceb7bf1`). Both paths are present in 0.6.4. |
| Re-check registry | [`invalid-self-weight-target`](../../web/src/lib/provenance/result-changes/invalid-self-weight-target.json), [`subdivided-member-self-weight`](../../web/src/lib/provenance/result-changes/subdivided-member-self-weight.json) |

## Affected features

Web 2D and PRO 3D models with self-weight rules targeting a group or
an explicit list of member IDs. The issue can affect single-case and
combination analysis, including spatial nonlinear routes, and load
totals derived from the same rules. A separate subdivision path also
affects the planar dynamics course when it calculates a model's response
with multiple segments per member.

## What was wrong

The load assembler could silently skip a deleted group member, plate
or quad, or an explicit member ID that never matched a member. The
spatial deleted-quad regression returned a vertical reaction of 3.5 kN,
from the tip load and the surviving member's weight. With a fractional
member ID of 1.5, the planar cantilever returned 2 kN, from the tip load
alone. Equilibrium can hold for the assembled loads while intended
self-weight is absent.

The planar subdivision helper could leave a valid self-weight scope
pointing only to the segment that inherited the original member ID.
The dynamics course could then use an underweighted force vector for
the initial static displacement in free vibration or for the harmonic
excitation. The remaining segments still contributed stiffness and mass.

[Results-change record](../results-changes/2026-11-self-weight-selectors.md).

## How to tell if your model is affected

Check that each scoped rule refers to the intended existing members,
plates and quads, including after a deletion or renumbering. Member IDs
must be nonnegative safe integers. Check dependent composite and
notional cases and compare the assembled loads and reactions with an
independent weight total. If you used the planar dynamics course with
per-member subdivision, also check the force vector in the model-based
response.

## Fixed in

The next release after 0.6.4. PR
[#2577](https://github.com/lambdaclass/stabileo/pull/2577) validates
references in the authored model before resolving the scope. Every
piece of a selected member inherits its selection when that member is
subdivided. Renumbering also refuses an edit that would assign a stale
reference to a different entity.

## Workaround

Restore the intended targets or correct the self-weight rule using
verified IDs and group membership. For a subdivided planar course
model, use whole-model self-weight if it matches the intended scope.
Otherwise, model the subdivided members explicitly and verify the weight
on every segment before calculating the response.

## What to do with results you already have

Repair affected rules and verify the assembled weight. Rerun affected
load cases and combinations, including nonlinear analyses where used,
and recalculate affected planar dynamics course responses. Rebuild
dependent envelopes, repeat design checks, and regenerate reports.

## Credits and references

See [issue #2565](https://github.com/lambdaclass/stabileo/issues/2565),
[PR #2577](https://github.com/lambdaclass/stabileo/pull/2577) and the
[self-weight scope and subdivision regressions](https://github.com/lambdaclass/stabileo/blob/6b47ae936/web/src/lib/engine/__tests__/self-weight-group-membership.test.ts).
