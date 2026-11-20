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
In #2366, a thin circular hollow section with outer radius 0.100 m and wall
thickness 0.001 m carried `Vz = 1 kN` and a torque of approximately
0.201 kN·m, with all other forces zero. At the fibre `y = 0, z = 0.0995 m`,
the result was 4.57 MPa total shear for either torque sign. Signed addition
gives 6.46 MPa for the reinforcing sign and approximately zero for the
cancelling sign. For the reinforcing sign the reported
von Mises stress was 7.91 MPa against a synthetic yield strength of 9 MPa,
so it passed. The signed reference gives approximately 11.19 MPa, which
fails that check. [Issue #2366](https://github.com/lambdaclass/stabileo/issues/2366).

Each cut also dropped the transverse shear component it did not plot when
it calculated total shear and von Mises. For the same tube with only
`Vz = 1 kN`, the midpoint of the width cut reported both as zero. The
selected-fibre calculation at that point gave 3.231245 MPa shear and
5.596681 MPa von Mises. [Section cut record](../results-changes/2026-11-section-stress-cut-magnitudes.md).

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
