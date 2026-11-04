# SA-2026-010: Spectral certificate returned "certified" with non-finite results

| | |
|---|---|
| Severity | Medium (a verification claim was wrong; the numbers themselves were visibly non-finite) |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-19) |
| Issue | [#335](https://github.com/lambdaclass/stabileo/issues/335) |
| Fix | PR [#398](https://github.com/lambdaclass/stabileo/pull/398) (merged 2026-10-19) |
| Affected versions | every version with `certify_spectral_3d`, up to 0.2.0 and `main` until the fix |
| Re-check registry | not needed if no saved project is affected (to confirm with the fix) |

## Affected features

The response-spectrum certificate (`certify_spectral_3d`) and, through the same pattern, any
certificate that did not reject non-finite values.

## What was wrong

For a spectral 3D input found by fuzzing (12 nodes, 24 elements, mode shapes supplied, direction
X), `certify_spectral_3d` returned success with **every displacement and element-force envelope
non-finite** (NaN). A certificate must refuse instead: a "certified" label on a NaN result is a
false verification claim.

## How to tell if your model is affected

A spectral analysis whose results show non-finite values (NaN, ∞, empty diagrams) while marked as
certified. Ordinary models have not been seen to trigger it; the input came from the nightly fuzzer
after about 3.3 million executions.

## Fixed in

`main` (#398, merged and deployed to stabileo.com on 2026-10-19); released in 0.3.0.

## Workaround

Treat any non-finite result as a failure regardless of its certificate status; check the modal
results (frequencies, effective masses) before running the spectral analysis.

## What to do with results you already have

Nothing, unless a delivered result showed non-finite values.

## Credits and references

Nightly fuzz job, target `json_dynamics` (run 39125781094, PR #326);
`docs/verification/FUZZ_MUTANTS.md`.
