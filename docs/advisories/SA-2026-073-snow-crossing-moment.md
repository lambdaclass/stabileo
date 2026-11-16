# SA-2026-073: Ridge-crossing members lost the snow load moment

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-16; drafted 2026-11-16 |
| Issue | [#2176](https://github.com/lambdaclass/stabileo/issues/2176) |
| Fix | PR [#2197](https://github.com/lambdaclass/stabileo/pull/2197); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `9d925a78093db05bf8b50eb125aa829fa5dd955d`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`snow-crossing-profile`](../../web/src/lib/provenance/result-changes/snow-crossing-profile.json) |

## Affected features

Generated snow distributed loads on members crossing the physical ridge,
including entered slopes, explicit panels and default tributaries. Generation
is shared before 2D/3D, linear/nonlinear and native/WASM solver selection.

## What was wrong

A member's midpoint selected one uniform pressure across the whole member.
Force could agree while the physical load moment was lost, silently.

On the recorded main witness, the 4 m crossing edge of a flat 16 by 4 m roof
with an entered 20 degree slope receives 0.40384615384615385 kPa uniformly.
The physical pressures are zero windward and 0.8076923076923077 kPa leeward.
At unit tributary width, main preserves the −1.6153846153846154 kN force but
returns zero ridge moment instead of −1.6153846153846154 kNm. These values
come from the [results-change replay](../results-changes/2026-11-snow-crossing-profile.md),
not a general error bound. The error is not assumed conservative.

This is a main-source replay; historical release binaries were not assessed.

## How to tell if your model is affected

Review generated snow on members that cross a pressure boundary. Compare the
integrated force and moment against the physical roof profile and check that
inserting nodes leaves both unchanged. Successful solving does not establish
correct load generation. This correction also affects generated roof and floor
area loads through shared physical classification and full-precision tributary
widths. Regenerate all affected generated area loads. The panel-geometry notice
conservatively selects all generated area loads alongside the snow-specific
ridge-crossing notice.

## Fixed in

Fixed in **0.6.2**, PR #2197. A shared roof-surface pressure
profile supplies ridge cuts to member and panel allocation. Each interval
retains its own pressure. Existing engineering and geometric limits are unchanged.

## Workaround

Independently verify the physical pressure profile, force and moment before
using affected generated loads. Split physical pressure changes when preparing
independently verified loads.

## What to do with results you already have

After upgrading to 0.6.2:

Regenerate all affected generated area loads, then rerun analyses, combinations
and design checks. Re-solving stored
loads alone does not correct them. Review sizing, calculations and deliverables
based on the previous loads.

## Credits and references

The coordinator reserved SA-2026-073 for #2176. The
[results-change record](../results-changes/2026-11-snow-crossing-profile.md)
contains the independent physical expectation and replay. Fixed in **0.6.2**, PR #2197.
