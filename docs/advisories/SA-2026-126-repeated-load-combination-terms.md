# SA-2026-126: Repeated combination terms could omit governing load patterns

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2569](https://github.com/lambdaclass/stabileo/issues/2569) |
| Fix | PR [#2590](https://github.com/lambdaclass/stabileo/pull/2590), merged as `a2cbf8c74` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Pattern ranking by individual term and editable project rules date to the first numbered release, 0.2.0 (`e738d775c`, `cbc3c83ac`). Ranking of flat-roof snow terms was affected from 0.6.2 (`aa75ce1db`). The affected ranking is present in 0.6.4. The snowless shared alternative was reproduced on the hosted build with [#2547](https://github.com/lambdaclass/stabileo/pull/2547) (`7d23b8c14`) and persisted through pre-fix main. |
| Re-check registry | [`repeated-combination-pattern-ranking`](../../web/src/lib/provenance/result-changes/repeated-combination-pattern-ranking.json) |

## Affected features

PRO load combinations generated from project rules with repeated terms
for the same action. This includes rules from saved projects and
templates, combinations created as composite load cases, and rules used
by Auto Loads. The generator selects the governing action patterns
before 2D or 3D analysis.

## What was wrong

The generator ranked each written term by its individual factor before
summing terms for the same action. The rule `1L + 1L + 1.5Lr` varied the
roof live-load cases and left out floor patterns. The equivalent
`2L + 1.5Lr` varied the floor patterns. In the saved-project regression,
the incomplete set gave a maximum vertical reaction of 16.5 kN and
omitted admissible reactions of 23.5 kN and 33.5 kN.

When physical and flat-roof snow cases shared an alternative set,
opposing terms for physical snow could also produce a snowless
combination on the hosted build. The regression returned vertical
reactions of 18.5 kN and 7.5 kN. The applicable flat-roof snow belongs in both combinations,
giving reactions of 18.5 kN and 15.5 kN. Both errors occurred without a
warning about case selection.

[Results-change record](../results-changes/2026-11-repeated-combination-pattern-ranking.md).

## How to tell if your model is affected

Inspect rules with multiple lines for one load symbol and the same
group and snow basis. Include implicit flat-roof terms selected by a
legacy flat-roof note. Check the signed sum and which load patterns the
generator selected. Verify that each combination in a shared snow
alternative set includes the appropriate nonzero snow load.

## Fixed in

The next release after 0.6.4. PR
[#2590](https://github.com/lambdaclass/stabileo/pull/2590) ranks each
resolved action by the magnitude of its signed total and excludes
exactly canceled actions from pattern selection and alternative choices
when their cases are available. If a rule contains exactly canceling
terms for an action with no cases in the model, remove the canceled
terms before generating. The missing-case check can still skip that rule.

## Workaround

Combine terms for the same action, group and snow basis into one signed
factor and remove exact cancellations. Independently verify the intended
case choices and factors, entering them directly where needed. Rebuild
affected composite cases, rerun analyses, rebuild envelopes and repeat
dependent design checks before using the results.

## What to do with results you already have

Review the rules and regenerate affected combinations and composite
cases. Verify their case IDs, factors, active selections and memberships
in named envelopes. Rerun the affected analyses, rebuild envelopes and
repeat dependent design checks and reports. Saved expanded combinations
retain their previous factors until rebuilt.

## Credits and references

See [issue #2569](https://github.com/lambdaclass/stabileo/issues/2569),
[PR #2590](https://github.com/lambdaclass/stabileo/pull/2590), the
[pattern ranking regressions](https://github.com/lambdaclass/stabileo/blob/a2cbf8c74/web/src/lib/engine/loads/__tests__/combination-cases.test.ts)
and the [generation and solver regressions](https://github.com/lambdaclass/stabileo/blob/a2cbf8c74/web/src/lib/store/__tests__/combination-groups-2535.test.ts).
