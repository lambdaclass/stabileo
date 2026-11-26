# SA-2026-128: Conversion could omit sign-reversing axial member loads

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-26 |
| Issue | [#2471](https://github.com/lambdaclass/stabileo/issues/2471) |
| Fix | PR [#2580](https://github.com/lambdaclass/stabileo/pull/2580), merged as `58906215a` |
| Fixed release | the next release after 0.6.4 (containment) |
| Affected versions | The planar conversion cutoff and spatial end-force cutoff date to the first numbered release, 0.2.0 (`6c196dd08`, `9d464a1ae`). Both are present in 0.6.4. |
| Re-check registry | [`member-line-load-accounting`](../../web/src/lib/provenance/result-changes/member-line-load-accounting.json) |

## Affected features

Application analysis of planar members with a distributed axial load
whose resolved end intensities are below the conversion cutoff, and
spatial trusses whose redistributed axial forces fall below the
end-force cutoff. The confirmed silent cases have equal and opposite
end intensities.

## What was wrong

Planar load conversion could omit the axial line. Spatial truss
conversion could discard both equivalent end forces. A symmetric
sign-reversing axial line has zero net force and zero spatial moment, so
case-wide equilibrium can agree even when its first moment along the
member and the associated axial response are lost.

The planar regression applies endpoint intensities of +2⁻³⁴ and −2⁻³⁴
kN/m on a 2 m member. The pre-fix solve returned no axial distributed
load in its member results. The spatial regression uses +2⁻³⁹ and
−2⁻³⁹ kN/m on a 2 m truss. The pre-fix solve of the supported truss
returned zero axial reaction at both ends. Both omissions occurred
without a load warning.

[Results-change record](../results-changes/2026-11-load-accounting-and-wall-contact.md#per-member-line-load-accounting).

## How to tell if your model is affected

Inspect distributed loads with opposing axial end intensities. Compare
the entered distribution with the axial loads in the planar member
results, or check the equivalent end forces for a spatial truss. A zero
case resultant can coexist with a nonzero member response.

## Fixed in

The next release after 0.6.4. PR
[#2580](https://github.com/lambdaclass/stabileo/pull/2580) compares
signed force and first moment along each member before and after load
preparation. When conversion loses a load, analysis stops and identifies
the affected case, member and component. Loads that transfer correctly
continue to solve.

## Workaround

If conversion omits a load or the new check refuses the case, use an
independently verified analysis that retains the intended axial distribution. Verify the
member response as well as the end reactions.

## What to do with results you already have

Rerun affected analyses and combinations using a verified representation
of the axial line loads. Review the axial-force distributions and end
reactions, rebuild envelopes and repeat dependent design checks and
reports.

## Credits and references

See [issue #2471](https://github.com/lambdaclass/stabileo/issues/2471),
[PR #2580](https://github.com/lambdaclass/stabileo/pull/2580) and the
[member-load regressions](https://github.com/lambdaclass/stabileo/blob/58906215a/web/src/lib/store/__tests__/solve-accounting.test.ts).
