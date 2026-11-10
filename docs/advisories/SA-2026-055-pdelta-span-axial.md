# SA-2026-055: P-Delta understated amplification when compression grew along a frame member under axial span loads

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-10; fix prepared locally, not released |
| Issue | [#1329](https://github.com/lambdaclass/stabileo/issues/1329) |
| Fix | PR [#1895](https://github.com/lambdaclass/stabileo/pull/1895), prepared locally; not merged or released |
| Affected versions | Confirmed on main `8f4c3ee6c`; release boundaries not bisected |
| Re-check registry | results-change entry `pdelta-span-axial` |

## Affected features

- **App: 2D and 3D P-Delta analysis** when a frame member carries a distributed
  load or point load with a component along its axis, and checks derived from
  that analysis.
- **Course:** the consistent second-order teaching solver under the same axial span loads.
- **Engine/WASM:** `solve_pdelta_2d`, `solve_pdelta_3d`, and their certified
  wrappers.

The effect depends on the axial force distribution and the deformed shape.
Compression growing toward the end that rotates most can produce unconservative
amplification. Purely nodal axial loads on a member with constant axial force are
outside this defect. Linear analysis and the already corrected linear buckling
solvers are outside this advisory.

## What was wrong

P-Delta built each frame element's geometric stiffness from its mean axial force.
Span loads make the axial force vary along the element. The missing term was
∫(N(x) − N̄)φ′ᵢφ′ⱼ dx. Refining the mesh reduced the error but did not make the
one-element result correct. Main carried a `PD-SPAN-AXIAL` warning for distributed
axial loads and 2D axial point loads, but still returned the numbers. Its 3D
warning did not cover axial point loads.

Measured on main `8f4c3ee6c`: a 4 m cantilever with EI = 20,000 kN·m², tip
thrust 3,000 kN, opposing axial span load +750 kN/m, and transverse tip force
1 kN. Compression rises from zero at its base to 3,000 kN at the tip. Both
2D and either 3D bending plane give the following:

| Quantity | Main, 1 element | Fixed, 1 element | Independent continuum reference |
|---|---:|---:|---:|
| Tip sway (mm) | 2.056224900 | 3.246977547 | 3.335195644 |
| Base moment (kN·m) | 7.084337349 | 10.165803109 | 10.396127264 |
| Displacement amplification B₂ | 1.927710843 | 3.044041451 | 3.126745917 |

Main's one-element sway was 38.35% low and its moment 31.86% low against the
continuum. At eight elements, sway was 3.307631802 mm on main and is
3.335175352 mm after the fix. The fixed one-element result agrees with an
independently integrated cubic Ritz model; its remaining error against the
continuum is interpolation error. Mesh convergence remains necessary.

The independent shooting solution of EI θ″ + (Px/L)θ = −F gives the critical
tip thrust Pcr = 4,345.773759991 kN. At 1.02 Pcr, main returned a stable
one-element result; the fix returns unstable. Full fixture parameters, equations,
mesh measurements and reference convergence are in
[the results-change write-up](../results-changes/2026-11-pdelta-span-axial.md).

## How to tell if your results are affected

Check whether a P-Delta result includes frame members with distributed or point
loads along their axes. Include gravity components on inclined members when
those components are passed as axial span loads. The model can be affected even
if a different member governs a design check.

The registry flags frame P-Delta projects, including projects without saved member
loads, because generated self-weight can create axial span loads. This is broader
than the defect: constant axial force or transverse-only span loads do not trigger
the missing axial-force term.

## Fixed in

Fix prepared locally on 2026-11-10; no published release is claimed. The fix
uses the existing buckling span integration on the P-Delta dense and sparse
paths, geometric end-force recovery, and certified residual model. It removes
`PD-SPAN-AXIAL` after correcting that formulation. Regressions are in
`engine/tests/pdelta_span_axial.rs`.

## Workaround

On affected builds, subdivide members carrying axial span loads and refine until
the displacement, moments and stability result converge. A fixed number of
subdivisions is not an accuracy guarantee, especially near critical load.

## What to do with results you already have

Re-run affected P-Delta analyses on a corrected build and reassess checks based
on their displacements, forces, amplification or stability. Compare refined
meshes where the result is sensitive to amplification. Previously reported
stable results can become unstable.

## Teaching solver and bundled examples (PR #1895)

The consistent teaching solver also used mean axial force. For its existing
5 m cantilever fixture with tip compression 100 kN, transverse tip force 2 kN,
axial span load −6 kN/m and EI = 20,000 kN·m², its base moment changes from
10.508408979997858 to 10.490333626707253 kN·m. Independent polynomial integration
of cubic geometric work confirms the corrected engine and teaching result; this
is the one-element discrete reference, not the exact continuum solution. The
derivation and source citation are in the results-change write-up.

The PRO examples `3d-portal-frame` and `3d-tower` carry axial self-weight on
vertical frame columns. Their refreshed snapshots change only P-Delta
displacements, member end forces, reactions, amplification and the removed
span-load diagnostic. All non-P-Delta outputs are byte-identical between current
main and the corrected engine.


## Force-based Rust matrix builders (PR #1895 review)

The public Rust APIs `build_kg_from_forces_2d` and
`build_kg_from_forces_3d` also returned mean-force geometric stiffness without
the axial span correction. Downstream callers using these matrices, including
after inclined-support rotation or constraint reduction, must recalculate
results under axial span loads. Both builders now use the shared span
integration, including both 3D bending planes and release condensation.

The application solvers in this repository use the corrected displacement-based
builders, so this follow-up does not identify an additional application result
change beyond the P-Delta scope above. The term-wise certificate already
includes the constant span matrix separately from its mean-force affine terms;
linear buckling also includes the correction once. Independent matrix
integration regressions in `engine/tests/pdelta_span_axial.rs` fail before this
follow-up and pass afterward.


## Axial-force centering (PR #1895 review round 2)

The first force-builder correction still combined an end-average constant
force with a length-average span correction. Those averages differ for
trapezoidal and off-centre point loads. Both builders now convert the supplied
end average to the length mean before adding the correction, so the complete
matrix integrates N(x) exactly for the existing cubic trial functions.
For a tip thrust P opposed by +P at L/4, mean compression is 3P/4 rather than
P/2. In the existing 4 m, P = 3,000 kN cantilever fixture, the tip-translation
geometric stiffness entry changes from −581.8359375 to −806.8359375 kN/m
in both 2D and 3D. An opposing axial trapezoid from P/(2L) to 3P/(2L)
changes that entry from −428.571428571429 to −353.571428571429 kN/m.
Independent Simpson regressions confirm both values and the unchanged
correct displacement assembly. Trusses and cables also receive the corrected
length mean in the force builders. Downstream callers must pass actual end
forces consistent with the input span loads and must not add the span
correction to the returned matrix again.


## Crane-hangar bundled example

`pro-crane-hangar` also uses axial self-weight and P-Delta combinations. Its
workbook maximum reaction Fx at node 33 in combination 4 changes from the stored
23.033548451025997 to 23.03318028125302 kN after the original span correction.
Current main (`f032e42fa`) reproduces the old value as 23.033548451026192 kN.
All seven linear cases, eleven linear combinations and linear envelopes are
byte-identical between that main engine and the corrected engine on identical
inputs. Changed outputs belong to P-Delta combinations and their derived
member forces, reactions, displacements and envelopes. The force-centering
follow-up does not introduce a further application result change. The existing
`pdelta-span-axial` registry notice includes this example and these quantities.


## Validation-04 workbook baseline

The validation-04 model also requests P-Delta per combination and includes axial
self-weight on frame members. Its maximum Fx reaction at node 6007 in combination
319 changes from the stored 514.3256888047089 to 514.3288411696504 kN after the
original span correction. Independently built main `87e1c9a1b` gives
514.3256888047104 kN, agreeing with the stored baseline within its unchanged
tolerance. All 72 changed workbook cells belong to P-Delta combinations 319,
321 or 322: displacement and rotation extrema, member forces, reactions, and
derived statics residuals and summaries. All 22 linear cases retain their stored
values. The existing `pdelta-span-axial` notice covers this model and these
quantities; no additional defect or release boundary is claimed.

Freshly regenerated linear-case statics from main and the corrected engine are
bit-identical across all seven baselines audited in this review. Last-bit drift
against older stored linear baselines therefore predates this PR. Only the
validation-04 baseline is refreshed. The full changed-cell breakdown and audit
scope are in the results-change write-up.

## Endpoint review before merge (PR #1895)

The last review also corrected endpoint handling in this PR's unmerged public
Rust force-based geometric-stiffness builders. Point loads at x = 0 and x = L
now leave the end-average matrix unchanged, with no varying-span term. Eight
closed-form frame/truss regressions cover both endpoints in 2D and 3D; all fail
before this correction and pass after it. The measured matrices and derivation
are in the results-change write-up. This endpoint regression was introduced by
this PR's local correction, not established in any released build. It adds no
release range to this advisory and does not change its draft status.
