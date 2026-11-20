# SA-2026-092: Detailed section stresses could understate shear and von Mises stress

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-20 |
| Issue | [#2366](https://github.com/lambdaclass/stabileo/issues/2366) |
| Fix | PR [#2372](https://github.com/lambdaclass/stabileo/pull/2372), merged as `a30fcfd04`; PR [#2382](https://github.com/lambdaclass/stabileo/pull/2382), merged as `f555de2d5` |
| Fixed release | Containment and cut correction pending release |
| Affected versions | All releases through 0.6.2 and main deployments before #2372 for combined shear or before #2382 for the cut magnitudes. Both calculations date to `3be722941` (2026-03-05) |
| Re-check registry | [`combined-section-shear-refusal`](../../web/src/lib/provenance/result-changes/combined-section-shear-refusal.json), [`section-stress-cut-magnitudes`](../../web/src/lib/provenance/result-changes/section-stress-cut-magnitudes.json) |

## Affected features

Detailed biaxial section stress in 3D frames and in planar frames that use
that calculation for rotated sections or eccentric loads. It affects the
selected-fibre stresses, Mohr circle and failure indicators, and total
shear and von Mises on both section cuts. These readouts can use previously
solved member forces. [Combined shear refusal record](../results-changes/2026-11-combined-section-shear-refusal.md),
[section cut record](../results-changes/2026-11-section-stress-cut-magnitudes.md).

## What was wrong

The calculation combined torsional shear in quadrature with transverse
shear, as though torsion introduced a third perpendicular component. At a
fibre the shear components add with sign and can reinforce or cancel.
Each cut also dropped the transverse shear component it did not plot when
it calculated total shear and von Mises.

### Thin-tube worked example

Take a circular hollow section with outer radius 0.100 m, wall thickness
0.001 m and member-local `Vz = +1 kN`. Axial force, the other transverse
force and both bending moments are zero at the station checked. Use the
mid-wall fibre at **member-local `y = +0.0995 m, z = 0`**. In the section
drawing and the WASM fibre arguments this is **`y = 0, z = +0.0995 m`**
(`yFiber = 0`, `zFiber = 0.0995`). Drawing `y` is section depth
(member-local `z`) and drawing `z` is section width (member-local `y`).
The wall tangent at this fibre is parallel to member-local `z`, so the
torsional and transverse shear contributions are collinear.

The transverse-only WASM query uses the signed Jourawski estimate and gives
+3.231245 MPa in the local `z` direction. To match that magnitude, use Bredt's relation
`|Mx| = 2 A_m t |τ_Vz|`, where `A_m = π (r − t/2)²` encloses the wall
midline. This gives `|Mx| ≈ 0.201000 kN·m`. Positive torque about local
`x` reinforces the transverse shear at the chosen fibre. Reversing the
torque makes the two contributions cancel.

The table compares the WASM export on `32ca94087` (main immediately before
#2372) with the signed sum of the same shear components. With zero normal
stress, von Mises is `√3 × |τ|`. The verdict is the von Mises check at a
synthetic yield strength of 9 MPa.

| Torque | Old total shear (MPa) | Old von Mises (MPa) | Old verdict | Signed local `z` shear (MPa) | Signed von Mises (MPa) | Signed verdict |
|---|---:|---:|---|---:|---:|---|
| Positive (reinforcing) | 4.569671 | 7.914902 | Pass | +6.462490 | 11.193362 | Fail |
| Negative (cancelling) | 4.569671 | 7.914902 | Pass | ≈0 | ≈0 | Pass |

On main at `35b08a1f0`, the WASM export reports
`combinedTorsionAndTransverseShear` for both torque signs and withholds
total shear, the Mohr circle and the failure verdict.

With `Vz = 1 kN` alone, the width-cut midpoint (both drawing coordinates
zero) previously reported zero total shear and zero von Mises. At the
same cut sample, current main reports 3.231245 MPa and 5.596681 MPa,
respectively, matching the selected-point calculation. [Section cut record](../results-changes/2026-11-section-stress-cut-magnitudes.md).

## How to tell if your model is affected

Look for detailed section stress reports from the biaxial calculation where
torsion and transverse shear coexist at a fibre or cut sample. Review the
Mohr circle and any pass based on the combined readout. Also check both
cuts wherever there is transverse shear, including cases with zero torque.
A curve plotting one shear component can show zero where the other
component is present.

## Fixed in

PR [#2372](https://github.com/lambdaclass/stabileo/pull/2372), merged as
`a30fcfd04`, shows a translated refusal wherever computed torsional and
transverse shear coexist. It withholds total shear, derived stresses and
the selected-fibre failure checks at those points. Individual stress
components remain available. PR [#2382](https://github.com/lambdaclass/stabileo/pull/2382),
merged as `f555de2d5`, uses both transverse components for cut magnitudes
and von Mises, with the shear curve still projected onto its cut. The
combined case remains refused pending a signed per-fibre calculation.
[Combined shear refusal record](../results-changes/2026-11-combined-section-shear-refusal.md),
[section cut record](../results-changes/2026-11-section-stress-cut-magnitudes.md).

## Workaround

Use a build containing both PRs and recompute the detailed stresses. For
any refused point, use an independently verified signed stress calculation
for the section and concurrent forces.

## What to do with results you already have

Re-run affected section stress queries, including queries made on saved
member forces. Review earlier shear and von Mises diagrams, Mohr circles,
pass indicators, and any sizing or reports that relied on them. Replace
affected readouts with corrected results or independently verified signed
stresses where the combined result is refused.

## Credits and references

See the [thin-tube reproduction in #2366](https://github.com/lambdaclass/stabileo/issues/2366),
the [combined shear refusal record](../results-changes/2026-11-combined-section-shear-refusal.md)
and the [section cut record](../results-changes/2026-11-section-stress-cut-magnitudes.md).
