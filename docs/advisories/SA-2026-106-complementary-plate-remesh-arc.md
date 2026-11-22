# SA-2026-106: Plate remeshing could use the complementary arc

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | [#2460](https://github.com/lambdaclass/stabileo/issues/2460) |
| Fix | PR [#2466](https://github.com/lambdaclass/stabileo/pull/2466) (containment), merged as `72779e3ea` |
| Fixed release | the next release after 0.6.3 (containment) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`physical-plate-remesh`](../../web/src/lib/provenance/result-changes/physical-plate-remesh.json) |

## Affected features

PRO models with remeshed curved plates where a boundary and a curved
member share end nodes and a circle, but the plate's specified
intermediate point lies on the opposite sweep.

## What was wrong

The remesher checked whether the member's interior nodes were on the
circle. It could use nodes on the complementary arc and create a shell
mesh with a different outline and area. Remeshing and analysis could
both succeed without a diagnostic.

In the production WASM reproducer, a plate with four fixed corners
under 1 kN/m² pressure and with self-weight disabled gave a total
vertical reaction of 14.3431457505 kN on the complementary sweep.
The mesh on the specified sweep gave 26.0743723476 kN under the same
pressure.
[Results-change record](../results-changes/2026-11-plate-remesh.md).

## How to tell if your model is affected

Compare the shell mesh boundary with the arc through the three points
in the plate definition. Check the side of the chord that contains the
specified intermediate point and the sweep of any curved member
joining the same endpoints. Recheck plates after replacing a curved
boundary member.

## Fixed in

Containment ships in the next release after 0.6.3. PR
[#2466](https://github.com/lambdaclass/stabileo/pull/2466) uses member
nodes only on the declared sweep. Ambiguous stations block remeshing
and analysis with a diagnostic naming the plate. A saved mesh on the
complementary sweep is stale and must be replaced before analysis.

## Workaround

Use a mesh whose boundary has been verified against the intended sweep
and whose connections to adjacent members match the model. Verify the
outline and area before running analysis.

## What to do with results you already have

Rebuild affected meshes on the specified sweep. Verify the outline,
loaded area and connections, then rerun analyses, combinations and
dependent design checks. Review reactions and regenerate affected
reports.

## Credits and references

See [issue #2460](https://github.com/lambdaclass/stabileo/issues/2460)
and [PR #2466](https://github.com/lambdaclass/stabileo/pull/2466) for the
complementary-arc reproducer.
