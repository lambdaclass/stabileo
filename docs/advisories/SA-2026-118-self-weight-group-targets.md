# SA-2026-118: Invalid self-weight group targets could omit gravity loads

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2472](https://github.com/lambdaclass/stabileo/issues/2472) |
| Fix | PR [#2540](https://github.com/lambdaclass/stabileo/pull/2540), merged as `f237e68a5` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Group-scoped self-weight and the empty-scope fallback date to `9d464a1ae` (first numbered release 0.2.0). The same resolver is present in 0.6.4 and the silent omissions were reproduced on pre-fix main |
| Re-check registry | [`missing-self-weight-group-membership`](../../web/src/lib/provenance/result-changes/missing-self-weight-group-membership.json) |

## Affected features

Web 2D and PRO 3D analyses with a self-weight rule targeting a group.
The confirmed cases are a reference to a missing group and an existing
group whose saved membership is a string.

## What was wrong

The scope resolver could interpret an invalid group target as an empty
group. The solve could return ordinary results for the other applied
loads while omitting the entire weight contribution of the group rule.
The planar and spatial cantilever regressions returned only the tip-load
reaction for both invalid targets. A valid populated group added the
member self-weight.

[Results-change record](../results-changes/2026-11-invalid-solver-numbers.md#refuse-self-weight-with-a-missing-group-or-invalid-membership).

## How to tell if your model is affected

Review every case with group-scoped self-weight. Check that the group
exists and that its saved membership contains the intended members and,
in PRO 3D, plates or quads. Compare the assembled gravity loads or
support reaction sum with the loads expected from the group. An
intentionally empty group has no self-weight contribution.

## Fixed in

The next release after 0.6.4. PR
[#2540](https://github.com/lambdaclass/stabileo/pull/2540) validates the
group and its membership before the planar or spatial assembler can
build the load scope. The refusal identifies the group that requires
repair.

## Workaround

Restore the intended group membership, or select an explicit scope that
matches the intended weight rule. Verify the assembled loads before
using the results.

## What to do with results you already have

Repair affected rules and rerun the affected load cases and
combinations, including active-set and P-Delta analyses where used.
Rebuild affected envelopes, repeat dependent design checks, and regenerate
affected reports.

## Credits and references

See [issue #2472](https://github.com/lambdaclass/stabileo/issues/2472),
[PR #2540](https://github.com/lambdaclass/stabileo/pull/2540) and the
[group-scoped self-weight regressions](https://github.com/lambdaclass/stabileo/blob/f237e68a5/web/src/lib/engine/__tests__/self-weight-group-membership.test.ts).
