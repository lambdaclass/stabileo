# SA-2026-076: One open wall could misclassify a building as open

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-16; fixed in PR #2220, pending merge and release |
| Issue | [#2203](https://github.com/lambdaclass/stabileo/issues/2203) |
| Fix | PR [#2220](https://github.com/lambdaclass/stabileo/pull/2220); pending merge and release |
| Fixed release | Not released |
| Affected versions | Confirmed on origin/main `9d925a780`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`wind-physical-pressure-field`](../../web/src/lib/provenance/result-changes/wind-physical-pressure-field.json) |

## Affected features

Generated CIRSOC 102-2025 building wind pressures classified from wall openings.
The enclosure classification controls internal pressure, including roof suction.
The generation path is shared TypeScript before solver selection; saved-project
regeneration notices apply in 2D, 3D and Pro.

## What was wrong

The old aggregate opening input tested the wall receiving positive pressure as
though it represented every wall. One open wall could classify the entire
building as open and remove internal pressure without a warning or refusal.

On origin/main `9d925a780`, the #2203 witness has one wall with openings/gross
area 90/100 m², three closed walls of 100 m² each, and a closed roof. The
classifier returns `open` instead of `partiallyEnclosed`. With the issue's
40 m/s speed, exposure C, site altitude zero, Kzt = 1, roof height 10 m,
L = 20 m, B = 10 m and roof slope 20 degrees, the internal pressure coefficient
magnitude is 0 instead of 0.55. Positive-internal-pressure leeward roof pressure
is −424.5423676390101 instead of −882.3821758771583 N/m².
These values are retained in the [results-change record](../results-changes/2026-11-wind-physical-pressure-field.md)
and its #2203 reproducer; they are a witness, not an error bound.

This is a main-source replay, not a historical release-binary replay. Earlier
introduction and historical release exposure have not been assessed.

## How to tell if your model is affected

Review buildings classified from aggregate openings, particularly a dominant
opening in one wall. Review every wall and the roof separately. A successful
solve does not validate the classification. The saved-project notice selects
all generated W and Wa loads conservatively; it does not prove that every
selected model had an incorrect classification.

## Fixed in

Fixed in PR #2220, pending merge and release.

Every wall now has its own gross and opening areas, and the roof has a separate
record. One classifier checks the complete envelope and all required
inequalities. Invalid or incomplete records refuse classification. All-open
buildings refuse the closed-building pressure procedure and require the
free-roof procedure. The editor supports removing records to the classifier's
minimum, including triangular buildings.

## Workaround

Until the correction is merged and released:
Independently classify the complete envelope under Art. 1.2 and Table 1.11-1
and verify internal pressure before using generated wind results.

## What to do with results you already have

After upgrading to a release containing the correction, review every wall and
roof opening record, reclassify the enclosure, regenerate W and Wa loads, then
rerun analyses, combinations and design checks. Re-solving stored generated
loads alone does not correct them. Review load distributions, governing cases,
member sizing, calculations and deliverables based on the old loads.

## Credits and references

The exposure is tracked as #2203. The coordinator assigned SA-2026-076.
The [results-change record](../results-changes/2026-11-wind-physical-pressure-field.md)
retains main witnesses, shared-path coverage, boundary tests and correct
controls. The fix is in PR #2220, pending merge and release.
