# SA-2026-115: Automatic gravity could load one floor region through multiple carriers

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2499](https://github.com/lambdaclass/stabileo/issues/2499), [#2299](https://github.com/lambdaclass/stabileo/issues/2299), [#2284](https://github.com/lambdaclass/stabileo/issues/2284) |
| Fix | PR [#2512](https://github.com/lambdaclass/stabileo/pull/2512), merged as `47afd8eee` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Independent panel gravity assignment to shells dates to `491d43d1d` (2026-10-01), first released in 0.2.0. The #2499 duplicate is confirmed in 0.6.4 and pre-fix main. Overlap checks varied across the earlier releases |
| Re-check registry | [`gravity-floor-ownership`](../../web/src/lib/provenance/result-changes/gravity-floor-ownership.json) and [`gravity-deck-and-roof-refusals`](../../web/src/lib/provenance/result-changes/gravity-deck-and-roof-refusals.json) |

## Affected features

Automatic Loads in panel mode, including explicit panel selection, for
models where overlapping shells or attached shells and framing can
claim the same part of a floor or roof. Saved generated loads and the
dead loads reported by level can both contain the duplicate.

## What was wrong

The planner could let several carriers each claim the same region.
For example, it could load two vertically connected shells over the
same floor, or load a shell and also generate distributed loads on
the beam bay it covered.

The #2499 regression applies 1 kN/m² to a 60 m² deck. In 0.6.4 the
planner reported READY without a warning about the duplicate, with
120 kN both in the applied loads and in the level total. This occurred
with automatic and explicit panel selection. The merged regression
requires generation to stop and identify the overlapping shells.
A separate main-branch regression returned READY for a sloped shell
and its attached bay and assigned the same footprint to both.

[Results-change record](../results-changes/2026-11-gravity-floor-ownership.md).

## How to tell if your model is affected

Review panel gravity plans for overlapping shells, and for shells and
beam bays or rafters connected at matching or offset stations. Compare
the applied shell pressures, distributed member loads and level totals
with the pressure intended for each physical floor or roof region.

## Fixed in

The next release after 0.6.4. PR
[#2512](https://github.com/lambdaclass/stabileo/pull/2512) assigns each
supported loaded region to one carrier and checks the assigned area
and emitted resultants before returning the plan. A shell that fully
covers a bay on the same deck can carry the floor load for the bay.
Generation stops when it cannot establish a single owner.

## Workaround

Assign the intended pressure once to an explicit carrier and check the
applied total for each affected deck before solving.

## What to do with results you already have

Regenerate affected automatic gravity plans in the fixed version. If
generation refuses, resolve the conflicting geometry or assign the
load once explicitly. Check the resulting loads and any dependent
mass source, then rerun affected load cases, combinations and
envelopes. Repeat dependent design checks and regenerate affected
reports.

## Credits and references

See [issue #2499](https://github.com/lambdaclass/stabileo/issues/2499)
and [PR #2512](https://github.com/lambdaclass/stabileo/pull/2512) for
the report, fix and [panel gravity regressions](https://github.com/lambdaclass/stabileo/blob/47afd8eee/web/src/lib/engine/loads/__tests__/plan-gravity.test.ts).
