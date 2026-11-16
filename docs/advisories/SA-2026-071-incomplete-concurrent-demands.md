# SA-2026-071: Member verification accepted incomplete concurrent demands

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-16; drafted 2026-11-15 |
| Issue | [#2096](https://github.com/lambdaclass/stabileo/issues/2096) |
| Fix | PR [#2173](https://github.com/lambdaclass/stabileo/pull/2173); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on main `8e5c026b7125f920c7a29141aa375c98c178f9b3`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`shared-demand-completeness`](../../web/src/lib/provenance/result-changes/shared-demand-completeness.json) |

## Affected features

Member design, verification and certification using concurrent combination and
station demands. The shared gate covers concrete and steel design, foreign-code
checks and EC2 peak design. Planar and spatial, linear and P-Delta sources reach
this TypeScript orchestration with WASM section kernels; there is no separate
native implementation of this orchestration.

## What was wrong

A surviving subset of demands could be treated as a complete input. Raw result
iteration omitted eligible model members whose force records were missing;
station extraction and peak design could use remaining stations or combinations.
Some callers also narrowed the active combination scope to results that existed.

The committed [main-source witness](../results-changes/2096-main-partial-witnesses.json)
contains a two-member concrete model. Removing member 2's raw force record while
retaining its complete concurrent demands returns only member 1, with
`overallStatus: ok`, without a missing-member diagnostic.
The complete reference includes member 2 and fails it.

The declared station grid is `[0, 0.5, 1]`. Removing the governing station at the
start, interior or end returns member 2 with Mu = 20 kN·m,
`overallStatus: ok` and flexure ratio 0.24471740822304575.
The complete input gives Mu = 2000 kN·m,
`overallStatus: fail` and ratio 5.497722648793581.
These values come from the committed record and
[fixture](../../web/src/lib/engine/__tests__/helpers/issue-2096-reference.ts).
They are a witness, not an error bound for other members.

This is a source replay of the exact main production files with the initialized
current WASM kernels, not a historical release binary replay. The evidence does
not establish that every injected incomplete API context can arise from ordinary
UI solve publication. Main already refuses a wholly missing active combination
at the direct station service following #2080; that existing refusal is not the
silent exposure demonstrated here.

## How to tell if your model is affected

Review saved concrete and steel designs where combinations, eligible members or
declared stations may be absent from the supplied force data. A passing surviving
row did not prove that the requested scope was checked. The saved-project notice
conservatively selects concrete and steel members; its absence cannot establish
that an older direct verification call was unaffected.

## Fixed in

Fixed in **0.6.2**, PR #2173. A shared completeness comparison validates
the requested combinations, members and declared stations before numerical checks.
Opaque complete-demand sets guard checking and certification cores. Requested scope
is retained through extraction, conversion and caller dispatch. Missing cells
produce typed refusals identifying the missing combination, member or station.
Grouped beam contexts retain each mesh piece's identity while sharing the complete
span demands. Complete-input numerical rules and tolerances are unchanged.

## Workaround

Until you upgrade to 0.6.2, independently establish that
every requested combination, eligible member and declared station is present
before accepting a design verdict or certificate. Do not rely on a passing subset.

## What to do with results you already have

Re-run affected saved concrete and steel designs after upgrading, including
foreign-code checks, reinforcement verification and profile proposals. Resolve
incomplete-demand refusals and review certificates, member sizing, calculations
and deliverables based on earlier passing results.

## Credits and references

The exposure is tracked as #2096. The coordinator assigned SA-2026-071 for
PR #2173. The [results-change record](../results-changes/2026-11-shared-demand-completeness.md)
retains the main witness, entry-point coverage, boundary tests and correct
controls. The [complete-input reference](../results-changes/2096-complete-reference.json)
records the answers retained by the fix.
