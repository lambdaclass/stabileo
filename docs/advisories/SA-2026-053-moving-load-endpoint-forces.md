# SA-2026-053: Moving-load envelopes included forces outside the member at endpoint point loads

| | |
|---|---|
| Severity | Low (spurious force extrema; conservative demand error) |
| Status | Published 2026-11-09 (fixed after 0.5.0; live on stabileo.com since 2026-11-09) |
| Issue | [#1782](https://github.com/lambdaclass/stabileo/issues/1782), blocker found in review of head `3bbedb2b5` |
| Fix | PR [#1783](https://github.com/lambdaclass/stabileo/pull/1783) (merged 2026-11-09 09:27:10 UTC) |
| Fixed release | 0.6.0 (2026-11-13) |
| Affected versions | Present on `origin/main` at `4f9b69cad`: 2D axial/shear and both 3D shears. First affected version not yet bisected. The 3D axial point-load path introduced in PR #1783 is corrected in the same PR |
| Re-check registry | results-change entry `moving-load-endpoint-forces` |

## Affected features

2D and 3D engine/WASM moving-load force envelopes when an axle or permanent point load
lies exactly at a member end. Axles commonly occupy those positions. Both member ends
are affected. This includes loads at supports and joints between path members.

## What was wrong

A recovered member-end force can include the equivalent force of an applied endpoint
point load. The moving-load range calculation included that raw value, and the pre-correction
3D jump calculation included both sides of endpoint jumps. One side is outside the
member. An endpoint point load acts as a nodal load for that member's internal forces:
only the limit approached from inside the member belongs in its envelope.

In the equilibrium regressions, a cantilever has a point force of magnitude 40 kN at
its fixed end. The support balances the whole force; a cut anywhere inside the unloaded
member has zero axial force and zero shear. The old envelope nevertheless contains a
40 kN force magnitude. Separate tests cover axial force and each transverse shear,
loads at either end, both load signs, and free-end loading. At a free end, equilibrium
requires the force to be carried through the member; the correction preserves it.

The old range was enlarged by spurious values. This overstates demand and can change
sizing or engineering decisions. No understated demand or capacity error is established
by this finding. It affected main before PR #1783 and is now corrected on stabileo.com.

## How to tell if your results are affected

Review moving-load sweeps with axle positions or permanent member point loads at either
end of a member. A load located on a support need not act inside that member. Compare
the member's interior force with equilibrium of the portion to either side of a cut.

The registry flags saved projects with members and moving-load position cases. It does
not require saved member point loads, since axles are generated during the sweep.
Transient sweeps leave no saved moving-load marker; review them even without a notice.

## Fixed in

After 0.5.0; live on stabileo.com since 2026-11-09.

PR #1783 uses the interior limits
at member ends in both dimensions and updates independent full-solve references.
Endpoint forces are normalized in private diagram copies so near-end sampling
also uses the interior force on short members, without changing any tolerance.
Interior 3D point loads still contribute both force limits. The correction is confined
to moving-load envelope extraction; static recovery and public diagrams are unchanged.

Thirteen equilibrium/reference regressions were first committed ignored as
`known wrong result: #1782` in `a8de5c44c`; all failed before the fix. See
[the results-change write-up](../results-changes/2026-11-moving-load-endpoint-forces.md).

## Workaround

Independently calculate member interior forces at endpoint-load positions using
nodal loads, or equilibrium cuts. A smaller train step cannot correct an exterior
member-force limit included by the range calculation.

## What to do with results you already have

Re-run affected moving-load envelopes with the corrected build and review member
sizing or deliverables based on their axial/shear extrema. Preserve the applied nodal
load and its support reaction when checking a load located at a member end.

## Credits and references

Found by Codex review of `3bbedb2b5`, supplied as a blocker on #1782 / PR #1783.
Expected forces in the regressions follow directly from force equilibrium; they are
not derived from another envelope implementation or a changed numerical baseline.

Endpoint recognition allows only a floating-point rounding bound of eight machine
epsilons times the member length. This keeps the rule invariant under unit scaling
when the stored point coordinate and recovered geometric length round differently.
Existing diagram comparison tolerances and all test tolerances remain unchanged.
The release metamorphic 2D unit checks exposed this distinction during verification;
no assertion or baseline was relaxed.
