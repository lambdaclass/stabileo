# SA-2026-111: Automatic gravity loads could count the same floor load twice

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | [#2284](https://github.com/lambdaclass/stabileo/issues/2284), [#2299](https://github.com/lambdaclass/stabileo/issues/2299) |
| Fix | PR [#2495](https://github.com/lambdaclass/stabileo/pull/2495), merged as `e0e9bbf15` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Reproduced on pre-containment main at `918a76194` and, for additional #2284 cases, at `a1d0032fd`. Affected releases are unconfirmed |
| Re-check registry | [`gravity-shared-deck-coverage`](../../web/src/lib/provenance/result-changes/gravity-shared-deck-coverage.json) |

## Affected features

Automatic Loads in panel mode for overlapping shells or an offset shell
connected to an overlapping beam bay. Both automatic deck selection and
explicit panel selection reproduced the duplicate loads.

## What was wrong

The planner could count overlapping level shell footprints once when
subtracting shell coverage from a beam bay, then apply pressure to both shells.
The overlap check could miss shells separated by roundoff within the deck
band (#2284). It could also miss an unreleased eccentric connection coupling
vertical motion between a shell and a beam bay. The shell received the floor
load and the beams received it again as direct distributed gravity (#2299).

The original issue models already refused on main at `918a76194`. At that
revision, the variants below all returned READY with no blocking diagnostic.
Each variant models one 10 × 6 m floor. The generated and level-summary
dead loads agreed.

| Issue and model | Physically applied at 1 kPa | Generated and reported on main | With #2495 |
|---|---:|---:|---|
| #2284, overlapping shells at 3 and 3.0000001 m | 60 kN | 72 kN | BLOCKED, shells 1 and 2 |
| #2284, same footprints at 3.0000001 and 3.0019999 m with the bay at 3.001 m | 60 kN | 72 kN | BLOCKED, shells 1 and 2 |
| #2299, four kinematically equivalent unreleased eccentric connections in place of rigid links | 60 kN | 120 kN | BLOCKED, shell 1 and beam members 1, 2, 3, 4 |

Additional #2284 models on main at `a1d0032fd` also returned READY without
a blocking diagnostic at 1 kN/m².

| Model | Generated and reported on main | With #2495 |
|---|---:|---|
| Parallel 10 × 6 m slopes at 3.000–3.002 m and 3.0001–3.0021 m | 120.0000066666665 kN in all 64 corner-order pairs | BLOCKED, shells 1 and 2 |
| The first slope paired with a horizontal shell at 3.0015 m | 120.00000333333324 kN in all 64 corner-order pairs | BLOCKED, shells 1 and 2 |
| Partial projected overlap of a mixed pair just inside the height limit | 96.00000266693327 kN | BLOCKED, shells 1 and 2 |
| Two connected sloped shells and a flat strip claiming the same beam bay with more than 1 mm vertical clearance in the shared area | 70.00000563333307 kN assigned to a 60 m² bay and the duplicate 10 m² strip | BLOCKED, shells 1 and 3 |

[Results-change record](../results-changes/2026-11-gravity-shared-deck-coverage.md).

## How to tell if your model is affected

Review the shells and beam bays used to generate panel gravity loads.
Check for overlapping shell footprints at nearly the same elevation or
claiming the same part of a beam bay. Check for eccentric connections
coupling vertical motion between an offset shell and an overlapping
bay. Compare the generated shell pressures, direct beam loads and
level dead loads with the intended floor load.

## Fixed in

The next release after 0.6.4. PR
[#2495](https://github.com/lambdaclass/stabileo/pull/2495) refuses generation
when shells overlap within the deck height tolerance or claim the same
part of a beam bay. It also refuses an overlapping shell and beam bay
coupled vertically by eccentric connections. The diagnostic identifies
the shells or the shell and beam members involved.

## Workaround

Resolve the overlapping claims in the layout so each floor area has a
single load carrier. Verify the generated shell and beam loads against
the intended floor load before using the results.

## What to do with results you already have

Regenerate any affected saved generated plan. If generation refuses,
resolve the conflicting load assignments and regenerate the plan.
Check the resulting shell and beam loads before rerunning affected
analyses and combinations, repeating dependent design checks and
regenerating affected reports.

## Credits and references

See [issue #2284](https://github.com/lambdaclass/stabileo/issues/2284) and
[issue #2299](https://github.com/lambdaclass/stabileo/issues/2299) for the
original reports and [PR #2495](https://github.com/lambdaclass/stabileo/pull/2495)
for the containment and regression tests. A related case is tracked in
[#2499](https://github.com/lambdaclass/stabileo/issues/2499).
