# SA-2026-070: Interior member deflection and rotation omitted span loads

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-15; fixed in PR #2170, pending release |
| Issue | [#2143](https://github.com/lambdaclass/stabileo/issues/2143) |
| Fix | PR [#2170](https://github.com/lambdaclass/stabileo/pull/2170); pending release |
| Fixed release | Not yet released |
| Affected versions | Confirmed on main `44966b6e75f72ce268ec87798d5cd880a6dba144`; earlier introduction not yet bisected and historical release binaries not assessed |
| Re-check registry | [`interior-member-couples`](../../web/src/lib/provenance/result-changes/interior-member-couples.json) |

## Affected features

Displayed interior deflection and rotation, deformed shape and education readouts
for frame members with span loads. The 2D hover and native/WASM shape paths
omitted concentrated member couples. The static second-order education sketch
omitted all member loads from its shape request. Spatial 3D curves and the
serviceability checks that consume them also used duplicated recovery formulas
for point and distributed loads. Linear and P-Delta results reach these paths;
both spatial bending planes and flat models solved through 3D are included.

The 3D member-point-load schema contains forces, not interior couple components.
An interior couple in 3D is represented by splitting the member and applying a
nodal couple. That supported equivalent is covered by the regression controls;
this advisory does not claim a nonexistent 3D couple field was dropped.

## What was wrong

The 2D hover particular solution ignored member couples. The WASM shape adapter
discarded the couple field, and the public native shape supplied an empty couple
list to the member solution. Hover rotation was interpolated between end
rotations rather than recovered at the requested section. These paths could
show zero interior displacement although the loaded beam bent, without a
warning naming the omission. Severity is High because part of the member load
was silently ignored, including a complete loss of the witness's interior
response. This is a less common concentrated-couple input, not a demonstrated
error in a governing strength quantity of a common workflow.

The retained fixed-fixed witness has length 5 m, EI = 20,000 kN·m² and a
6 kN·m couple at 2 m. At 1 m, main's hover and public native/WASM shape return
zero; the correct deflection is −3.6e−6 m. The independent piecewise polynomial
solution with zero end displacement and rotation is retained in the
[results-change record](../results-changes/2026-11-interior-member-couples.md)
and [regression tests](../../web/src/lib/engine/__tests__/interior-couples-2143.test.ts).
These values are a witness, not a bound on errors in other models. The parent
replay returned the wrong values without a recovery warning; it is source
replay evidence, not a replay of historical release binaries.

The duplicated TypeScript full trapezoid formula and partial trapezoid Simpson
approximation also disagreed with the independent beam solution without any
couples. Both now use the engine's exact loaded-member recovery. Native/WASM
no-couple shapes remain exactly equal at the 504 stations of the 24 saved
[parent-shape controls](../results-changes/2143-no-couple-shapes.json).
TypeScript-only curves under those loads can change even without a couple.

With nonzero transverse span loads and missing, nonfinite or insufficient EI,
recovery could silently return the load-free interpolation. The fix explicitly
refuses loaded planar recovery unless finite EI exceeds the existing 1e-6 cutoff;
it does not lower that cutoff. Spatial recovery retains its finite positive EI criterion. Load-free and axial-only recovery still returns
a curve. A refusal is not a zero-deflection answer.

**The application serviceability checks consumed the affected recovered curves.**
The code path is
[`serviceability.ts`](../../web/src/lib/store/serviceability.ts) `deflectionChecks`
→ [`service-deflection.ts`](../../web/src/lib/store/service-deflection.ts)
`serviceDeflections` / `spanCurve` →
[`member-deflection.ts`](../../web/src/lib/engine/member-deflection.ts)
`memberLocalCurve`. Steel and concrete deflection checks read those spatial
curves, including their full and partial distributed-load recovery. The
verification tab, reports and deflection table share these checks. Thus this
change can affect serviceability decisions, not just the drawn line. No
specific passing-to-failing serviceability verdict is claimed by the retained
couple witness: its planar hover/shape omission alone does not prove one.

**No strength design check consumed these recovered displacement or rotation
values.** [`verification-service.ts`](../../web/src/lib/engine/verification-service.ts)
extracts strength demands from the solver's member forces; it does
not read the hover, shape or education curve. Nodal solver displacements,
member forces and reactions are unchanged by this recovery fix. This does not
establish that a past engineering decision based on a displayed deflection was
safe.

## How to tell if your model is affected

Review saved frame models with loads applied inside members, especially
concentrated couples, full or partial trapezoids and released ends. Check
interior hover values, rotations, deformed shapes, static education sketches
and deflection-based serviceability results. A zero interior curve with fixed
ends did not establish that a loaded member was undeformed.

The saved-project notice conservatively selects models with members and member
loads, in either 2D or 3D, matching the registry condition. No-couple models can
be affected through the TypeScript distributed-load recovery. Missing or
insufficient bending stiffness must be resolved before accepting a loaded curve.

## Fixed in

PR #2170 merged the recovery fix from branch `fix/2143`; it is pending release.
No released version is claimed to contain the fix. A single Rust
`MemberDeflection` solution now recovers interior displacement and section
rotation for every member-load variant through `recover_member`. Full point
records survive the native/WASM shape boundary. TypeScript hover and both
spatial bending planes call this shared engine path. Exhaustive load matching
and record destructuring require deliberate handling of added load variants or
fields. The education sketch forwards every static load variant explicitly.
The existing EI limit, numerical tolerances and solver acceptance limits are
unchanged.

## Workaround

Until the fix is merged and released, independently calculate interior
member deflections and rotations for affected loads, and review serviceability
using those independent values. A split-member model with a nodal couple is a
supported equivalent for an interior couple, but splitting alone does not
validate every other distributed-load recovery path. Do not accept a zero
interior display or a serviceability pass solely from the affected curves.

## What to do with results you already have

After upgrading to a release containing PR #2170, reopen affected saved projects,
rerun their analyses and review interior deflections, rotations, deformed shapes,
education readouts and steel/concrete serviceability checks. Revisit sizing,
calculations and deliverables that relied on those values. Resolve any explicit
missing-EI refusal before using a recovered curve.

## Credits and references

The omission was tracked as #2143 and fixed in PR #2170. The coordinator
explicitly assigned SA-2026-070 during the second review round. The
[results-change record](../results-changes/2026-11-interior-member-couples.md)
retains the main witness, entry-point coverage, EI boundary tests, trapezoid
replays and correct controls. Commit `53634442f3b5daf4cb2ad79dad4cd5f67b7440fb`
contains the initially ignored failing reproducers; commit
`09b3b589be70a9aef9b460f1cd5bc5bd5a54eb7e` supplies shared recovery and enables them.
