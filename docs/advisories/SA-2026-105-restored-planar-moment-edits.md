# SA-2026-105: Editing a restored planar point couple to zero could leave the old moment active

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | [#2459](https://github.com/lambdaclass/stabileo/issues/2459) |
| Fix | PR [#2467](https://github.com/lambdaclass/stabileo/pull/2467), merged as `fb206b3c8` |
| Fixed release | the next release after 0.6.3 |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`restored-planar-moment-edits`](../../web/src/lib/provenance/result-changes/restored-planar-moment-edits.json) |

## Affected features

Projects with a legacy planar member point couple whose moment was edited
after reopening the project. The wrong moment could reach both 2D and 3D
analysis.

## What was wrong

Restoring a point couple saved with only `mz: 5` could copy that value to
`my` and retain `mz`. Editing the displayed moment to zero changed only
the `my` field, leaving the solver to apply the old `mz` without warning.
In the two-metre cantilever reproducer, the edit left a 5 kN·m jump at the
couple location, one metre from the fixed end, in both 2D and 3D. On main
after PR #2456, editing the same restored moment to 3 kN·m could stop
analysis because the two stored values conflicted.
[Results-change record](../results-changes/2026-11-restored-planar-moment-edits.md).

## How to tell if your model is affected

Check planar point couples edited after reopening a saved project,
especially edits intended to clear a moment. Compare the intended
moment with the jump in the member moment diagram. An affected saved
record can be indistinguishable from a valid legacy record with one
nonzero moment field. Use the original loading information to verify
the intended value.

## Fixed in

The next release after 0.6.3. PR [#2467](https://github.com/lambdaclass/stabileo/pull/2467)
uses one writable moment field for restored planar point couples and
nodal moments. An explicit finite edit replaces the stored moment and
clears the legacy alias, including an edit to zero. Conflicting or
invalid saved moment values block analysis until a finite value is
entered.

## Workaround

Recreate the affected point load with its intended components. For a pure
couple intended to be zero, remove the load. Verify the resulting member
moment diagram before relying on the analysis.

## What to do with results you already have

Verify and re-enter the intended moments, including explicit zeros.
Rerun affected analyses and combinations, check reactions and member
forces, and repeat dependent design checks and reports.

## Credits and references

See [issue #2459](https://github.com/lambdaclass/stabileo/issues/2459)
and [PR #2467](https://github.com/lambdaclass/stabileo/pull/2467) for the
legacy-file reproducer and the 2D and 3D checks.
