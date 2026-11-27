# SA-2026-114: Saved combination rules could apply factors to the wrong load group

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2535](https://github.com/lambdaclass/stabileo/issues/2535), item 1 |
| Fix | PR [#2547](https://github.com/lambdaclass/stabileo/pull/2547), merged as `7d23b8c14` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Project rule generation from 0.2.0 through 0.6.4 when given a grouped rule. Saved project rules date to `cbc3c83ac` (2026-09-25). Reproduced at `b78c25769` and in 0.6.4 |
| Re-check registry | [`combination-load-groups`](../../web/src/lib/provenance/result-changes/combination-load-groups.json) |

## Affected features

Generation from saved project rules that name a load group, including rules
received in a project file or imported as a rule template. The wrong factors
can be stored in load combinations or composite cases and used in 2D or 3D
analysis. Auto Loads can also generate combinations from project rules.

## What was wrong

The generator selected cases by load symbol alone. Floor and roof cases
with the same live-load symbol could receive the same factor even when the
rule named only the roof group. Importing a rule template could also
discard the group field. Generation and analysis could succeed without
warning about the mismatch.

In the regression, the floor and roof cases apply 3 kN and 5 kN downward.
A factor of 2 on the roof group alone should give a vertical reaction of
10 kN. The old combination and envelope returned about 16 kN.

[Results-change record](../results-changes/2026-11-combination-load-groups.md).

## How to tell if your model is affected

Compare the original rule and the load cases intended for each group with
the case IDs and factors in each generated combination or composite
case. Check the original template if the saved rule has lost group
information. Pay particular attention to distinct groups that share a
load symbol.

## Fixed in

The next release after 0.6.4. PR
[#2547](https://github.com/lambdaclass/stabileo/pull/2547) uses one shared
expansion that matches the load symbol and the named group. An active term
with an unresolved group blocks generation. The template parser preserves
the group.

## Workaround

Enter explicit case IDs and their intended factors in the combination
or composite case. Check them against the original rule before solving.

## What to do with results you already have

Restore any missing group information from the original rule and
regenerate the affected combinations and composite cases in the fixed
version. Opening a project leaves its previously generated factors in
place. Rerun the affected linear or nonlinear analyses and envelopes,
repeat dependent design checks and regenerate affected reports.

## Credits and references

See [issue #2535](https://github.com/lambdaclass/stabileo/issues/2535)
and [PR #2547](https://github.com/lambdaclass/stabileo/pull/2547) for the
report, fix and [combination regressions](https://github.com/lambdaclass/stabileo/blob/7d23b8c14/web/src/lib/store/__tests__/combination-groups-2535.test.ts).
