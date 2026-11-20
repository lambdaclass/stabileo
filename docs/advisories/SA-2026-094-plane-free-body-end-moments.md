# SA-2026-094: The 2D free-body inspector could show global end moments with the wrong sign

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-20 |
| Issue | [#2385](https://github.com/lambdaclass/stabileo/issues/2385) |
| Fix | PR [#2364](https://github.com/lambdaclass/stabileo/pull/2364), merged as `9452c5b74` |
| Fixed release | Pending release |
| Affected versions | 0.2.0 through 0.6.2, desktop 0.1.0 alpha.1 through alpha.3, and main deployments with the 2D free-body inspector before #2364. The inspector dates to `5db44de3a` (2026-06-18) |
| Re-check registry | None. The issue affected presentation only |

## Affected features

The global-basis `M` values shown for member ends in the 2D free-body
inspector, whether opened by selecting a member or by inspecting that
member's end at a node. Analysis results were unaffected.
[Issue #2385](https://github.com/lambdaclass/stabileo/issues/2385).

## What was wrong

The inspector displayed the internal bending-diagram moment as the global
moment acting on the isolated member. The conversion depends on the
member's orientation and the end being inspected. An incorrect sign could
make the displayed moments fail equilibrium without a warning. The curved
arrow already pointed in the correct direction in the replay.

A 4 m horizontal cantilever with a 10 kN downward tip load and a
+3 kN·m tip couple should have member-end moments of about +37 kN·m at
the support and +3 kN·m at the tip. The old inspector showed about +37
and −3 kN·m. Including the moment from the tip force, the displayed
actions left a residual of approximately −6 kN·m about the support. With
#2364, the tip readout shows +3 kN·m and the moment sum is zero. The WASM support
reactions and member forces agree before and after the fix.
[WASM replay](replays/SA-2026-094.json).

## How to tell if your model is affected

Review any 2D free-body checks made in the global basis before the fix.
Engineers, reviewers or students who used the numeric `M` readouts to
check member equilibrium or who copied them into calculations or reports
could have used the wrong moment direction.

## Fixed in

PR [#2364](https://github.com/lambdaclass/stabileo/pull/2364), merged as
`9452c5b74`, uses the same signed member-end action to produce the
global inspector values and the diagram. The global values include the
end-face and orientation signs.

## Workaround

Use a build containing #2364. If that build is unavailable, check the
member-end actions independently by summing moments about a member end
with one consistent global sign convention.

## What to do with results you already have

Inspect the affected member ends again in a fixed build. Review any
equilibrium check or downstream calculation that used the displayed
signs, then regenerate and review the affected reports.

## Credits and references

See [issue #2385](https://github.com/lambdaclass/stabileo/issues/2385),
[PR #2364](https://github.com/lambdaclass/stabileo/pull/2364) and the
[replay procedure](replays/SA-2026-094-095.md).
