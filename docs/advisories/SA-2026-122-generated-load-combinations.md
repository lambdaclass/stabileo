# SA-2026-122: Load combination generation could use the wrong load cases

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2558](https://github.com/lambdaclass/stabileo/issues/2558) |
| Fix | PR [#2566](https://github.com/lambdaclass/stabileo/pull/2566), merged as `93c538359` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | The directional selection and Auto Loads case selection and replacement paths were affected by the first numbered release, 0.2.0 (`e9db31fdc`, `395125d87`, `86b13cd1d`, `06a3a0eba`). Flat-roof snow selection was affected from 0.6.2 (`aa75ce1db`). The affected paths are present in 0.6.4. Local replays used the hosted revision immediately before #2566 (`363131079`). The template import defect persisted through 0.6.4 and was fixed on the hosted app by [#2547](https://github.com/lambdaclass/stabileo/pull/2547). |
| Re-check registry | [`combination-alternative-coverage`](../../web/src/lib/provenance/result-changes/combination-alternative-coverage.json), [`retained-case-and-rule-factors`](../../web/src/lib/provenance/result-changes/retained-case-and-rule-factors.json), [`repeat-auto-loads-replacement`](../../web/src/lib/provenance/result-changes/repeat-auto-loads-replacement.json), [`retired-and-directional-combinations`](../../web/src/lib/provenance/result-changes/retired-and-directional-combinations.json) |

## Affected features

Stabileo PRO project combination rules, including combinations generated as
composite cases, and 3D Auto Loads. The project rule defects affect both 2D
and 3D results. The generator chooses the cases and factors before linear or
nonlinear analysis uses them.

## What was wrong

The pre-fix build could generate and solve combinations without warning
about incorrect case selection.

- **Shared directional alternatives.** A project rule with wind and seismic
  could pick the stand-alone wind and seismic cases and skip their shared
  alternative set entirely. The extra combination gave a vertical reaction
  of 24 kN in the regression model. The two valid combinations gave 18 kN
  and 12 kN.
- **Manual roof live load.** Auto Loads could retain a manual roof live load
  in the model but omit its case from the generated combinations when its
  alternatives key matched a planned case. In the regression, the plan
  applied 3 kN and the manual case applied 5 kN. With a factor of 2, the
  vertical reaction was 6 kN instead of 16 kN. A case marked as generated
  could also be omitted despite having manual loads, and Replace could
  delete those loads when nothing else referenced the case.
- **Flat-roof snow factors.** Editing an ungrouped flat-roof snow factor
  could strip the snow basis and select the physical snow case. Template
  import could also strip the basis through 0.6.4. In the edit regression,
  setting the factor to 2 gave a vertical reaction of 6 kN from physical
  snow instead of 10 kN from the flat-roof case.
- **Auto Loads replacement.** When replacement removed the last load from
  an obsolete wind case, the empty case could still appear in new
  combinations. Replaying the wind replacement fixture without a deliberate
  no-wind alternative produced a spurious result with zero horizontal
  reaction alongside the intended result with a 5 kN horizontal reaction
  magnitude. Even when the plan and factors were identical, repeated
  replacement could create new combination IDs and drop their memberships
  from custom named envelopes.

[Results-change records for alternative coverage](../results-changes/2026-11-combination-alternative-coverage.md),
[retained cases](../results-changes/2026-11-retained-case-and-rule-factors.md),
[replacement](../results-changes/2026-11-repeat-auto-loads-replacement.md)
and [retired cases](../results-changes/2026-11-retired-and-directional-combinations.md).

## How to tell if your model is affected

Compare the generated case IDs and factors with the original rules and
load cases. Check wind and seismic rules that use shared alternative
sets alongside stand-alone directions. Compare manual roof live loads
with the loads and cases present after Auto Loads. For edited or imported
snow rules, compare the saved terms with the original template and
verify that flat-roof terms select the flat-roof cases. After replacing
a plan, check for obsolete empty cases and verify membership in each
named envelope and the active combination list.

## Fixed in

The next release after 0.6.4. PR
[#2566](https://github.com/lambdaclass/stabileo/pull/2566) requires
coverage of active shared alternative sets and refuses generation when
eligible directional choices cannot be represented. It keeps eligible
manual roof loads in the case inventory and preserves the snow basis
when a factor is edited. Replacement records cases that it empties so
they stay out of subsequent generation, and preserves unchanged
combinations and their scope memberships on repeat Apply.

## Workaround

Verify the intended cases and factors independently and enter them
directly in the affected combinations. Check the project's loads
against the original model or backup, then verify which combinations
are included in each envelope before relying on its results.

## What to do with results you already have

Restore missing manual loads and snow bases from the original model
or template. Review empty load cases and keep intentional alternatives.
Reapply affected Auto Loads plans with the fixed version and regenerate
affected combinations and composite cases. Restore any lost envelope
memberships or active selections. Rerun affected analyses and rebuild
the envelopes, then repeat dependent design checks and regenerate
reports. Opening the project alone leaves its saved factors in place.

## Credits and references

See [issue #2558](https://github.com/lambdaclass/stabileo/issues/2558),
[PR #2566](https://github.com/lambdaclass/stabileo/pull/2566),
the [combination generation and solve regressions](https://github.com/lambdaclass/stabileo/blob/93c538359/web/src/lib/store/__tests__/combination-groups-2535.test.ts)
and the [repeat replacement regressions](https://github.com/lambdaclass/stabileo/blob/93c538359/web/src/lib/store/__tests__/apply-load-plan-idempotent.test.ts).
