# SA-2026-082: Companion combinations selected the wrong snow member loading

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-16 |
| Issue | [#2211](https://github.com/lambdaclass/stabileo/issues/2211) |
| Fix | PR [#2233](https://github.com/lambdaclass/stabileo/pull/2233); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on main `7170713acf5c52e0cb83d31c4572da382781bee5`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`snow-companion-basis`](../../web/src/lib/provenance/result-changes/snow-companion-basis.json), [`snow-combination-validation`](../../web/src/lib/provenance/result-changes/snow-combination-validation.json) |

## Affected features

Generated CIRSOC 101 companion combinations requesting flat-roof snow while
selecting physical roof snow cases, including slope reduction and physical
patterns. Snow generation and combination expansion precede 2D/3D,
linear/nonlinear and native/WASM solver selection.

## What was wrong

The combination note requested flat-roof snow, but its S term selected ordinary
physical roof snow. The stored member loading therefore represented a different
pressure field. On the main-source witness, a projected 10 m member at 20 degrees
with unit tributary width received a companion contribution of
2.692307692307692 kN instead of 3.5 kN, without refusal. The inputs, pressure
formulas and independent member-response integrals are in the
[results-change record](../results-changes/2026-11-snow-companion-basis.md) and
[retained regression](../../web/src/lib/engine/loads/__tests__/snow-companion-2211.test.ts).
These witness values are not an error bound; the error is not assumed conservative.
This is a main-source replay; historical release binaries were not assessed.

Review of unmerged correction `aa75ce1db` found two remaining defects. An old
seismic specification carrying the flat-roof note and raised f2=0.7 was
reinterpreted as 0.7*pf, losing the physical 0.7*S requirement. A specification
requesting pf with no S cases could also be silently omitted before validation.
Those review defects are reproduced in the
[round-2 tests](../../web/src/lib/engine/loads/__tests__/snow-legacy-2233.test.ts);
the unmerged-branch reinterpretation is not claimed as a released defect.

## How to tell if your model is affected

Review generated snow and saved companion combinations, especially sloped roofs
and legacy seismic specifications carrying the flat-roof note. Confirm the
selected member load cases represent the required snow basis. Regenerating only
snow does not repair saved ambiguous seismic specifications. A successful solve
or matching total resultant does not establish correct member loading.

## Fixed in

0.6.2 (PR [#2233](https://github.com/lambdaclass/stabileo/pull/2233)). The typed snow
basis selects a separate pf member-loading case. Physical snow remains in
principal and seismic combinations and mass. The shared expander refuses
ambiguous legacy seismic specifications until combinations are regenerated,
and validates required pf availability before absent-symbol omission.
Existing engineering limits and test tolerances are unchanged.

## Workaround

Independently verify the physical snow fields, selected member loads and member
responses before relying on affected results. Regenerate both snow loads and
combinations with the correction; regenerating snow loads alone is insufficient.

## What to do with results you already have

After upgrading to 0.6.2, regenerate snow loads
and combinations, then rerun analyses and design checks. Re-solving stored loads
alone does not correct them. Review sizing, calculations and deliverables based
on earlier combinations.

## Credits and references

The coordinator assigned SA-2026-082 to #2211.
The [original results-change record](../results-changes/2026-11-snow-companion-basis.md)
and [combination validation record](../results-changes/2026-11-snow-combination-validation.md)
contain the scope, independent expectations and replay evidence. The separate
step-drift transfer issue #2218 remains unresolved by this correction.
